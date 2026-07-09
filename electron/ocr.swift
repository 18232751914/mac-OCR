// 文件：electron/ocr.swift
// 职责：macOS 离线 OCR 脚本。基于 Apple Vision 框架（VNRecognizeTextRequest）
//       识别图片文字，支持中/英/日/韩多语言；并尝试按列聚类重建表格为 TSV。
//       多路回退：CGImageSource → VNImageRequestHandler(url) → NSImage。
//       由主进程写临时 PNG 后通过 swift/swiftc 调用，输出 {"text":"..."} JSON。
// 依赖：Vision、AppKit、CoreImage、Foundation

import Foundation
import Vision
import AppKit
import CoreImage

// ── Output helpers ──
struct OcrResult: Encodable { let text: String }

func log(_ msg: String) { fputs("[ocr] \(msg)\n", stderr) }

func printResult(_ text: String) {
    let encoder = JSONEncoder()
    let result = OcrResult(text: text)
    if let data = try? encoder.encode(result),
       let json = String(data: data, encoding: .utf8) {
        print(json)
        fflush(stdout)
    }
}

// ── Light preprocessing (fallback only) ──

func preprocess(_ ciImage: CIImage) -> CIImage? {
    let cc = CIFilter(name: "CIColorControls")!
    cc.setValue(ciImage, forKey: kCIInputImageKey)
    cc.setValue(0.0,  forKey: kCIInputBrightnessKey)
    cc.setValue(1.06, forKey: kCIInputContrastKey)
    cc.setValue(0.0,  forKey: kCIInputSaturationKey)
    return cc.outputImage
}

func createEnhancedCGImage(from ciImage: CIImage) -> CGImage? {
    guard let processed = preprocess(ciImage) else { return nil }
    if let cg = CIContext().createCGImage(processed, from: processed.extent) {
        return cg
    }
    let sw = CIContext(options: [.useSoftwareRenderer: true])
    return sw.createCGImage(processed, from: processed.extent)
}

// ── Text block ──

struct TextBlock {
    let text: String
    let y: CGFloat
    let x: CGFloat
    let height: CGFloat
    let width: CGFloat
    let confidence: Float
    let centerY: CGFloat
    let centerX: CGFloat
}

// ── Vision OCR (returns raw texts AND structured blocks) ──

func runVision(on cgImage: CGImage, level: VNRequestTextRecognitionLevel)
    -> (rawTexts: [String], blocks: [TextBlock])
{
    let imageW = CGFloat(cgImage.width)
    let imageH = CGFloat(cgImage.height)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja-JP", "ko-KR"]
    request.minimumTextHeight = 0.0

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do { try handler.perform([request]) }
    catch { log("Vision threw: \(error.localizedDescription)"); return ([], []) }

    let observations = request.results ?? []
    log("Vision(\(level == .accurate ? "accurate" : "fast")): \(observations.count) obs on \(cgImage.width)×\(cgImage.height)")

    var rawTexts: [String] = []
    var blocks: [TextBlock] = []

    for obs in observations {
        let top = obs.topCandidates(1)
        guard let first = top.first else { continue }
        let t = first.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { continue }

        rawTexts.append(t)

        let bbox = obs.boundingBox
        let pxX  = bbox.origin.x * imageW
        let pxY  = (1 - bbox.origin.y - bbox.height) * imageH
        let pxW  = bbox.width  * imageW
        let pH   = bbox.height * imageH

        blocks.append(TextBlock(
            text: t, y: pxY, x: pxX,
            height: pH, width: pxW,
            confidence: first.confidence,
            centerY: pxY + pH / 2,
            centerX: pxX + pxW / 2
        ))
    }
    return (rawTexts, blocks)
}

// ── Table reconstruction ──

/// Cluster block centre-X values into columns. Uses centre positions (robust to
/// left/right/centre cell alignment) and discards weak single-block clusters.
func computeColumnCenters(from blocks: [TextBlock], imageWidth: CGFloat) -> [CGFloat] {
    guard blocks.count >= 2 else { return [] }

    var values = blocks.map { $0.centerX }
    values.sort()

    // Larger gap so that a column whose header/data are aligned differently
    // (e.g. left-aligned header but centred cell text) still merges into one
    // cluster instead of being split into phantom columns.
    let gapThreshold = max(imageWidth * 0.025, 12)
    var clusters: [[CGFloat]] = []
    var cur: [CGFloat] = [values[0]]

    for i in 1..<values.count {
        if values[i] - values[i-1] > gapThreshold {
            clusters.append(cur)
            cur = [values[i]]
        } else {
            cur.append(values[i])
        }
    }
    clusters.append(cur)

    let strong = clusters.filter { $0.count >= 2 }
    guard !strong.isEmpty else { return [] }
    return strong.map { $0.reduce(0, +) / CGFloat($0.count) }.sorted()
}

func minimalGap(of values: [CGFloat]) -> CGFloat {
    let s = values.sorted()
    guard s.count > 1 else { return 30 }
    var g = CGFloat.greatestFiniteMagnitude
    for i in 1..<s.count {
        g = min(g, s[i] - s[i-1])
    }
    return g
}

/// Group blocks into rows by centre-Y, then assign each to its nearest column.
func assignToColumns(_ blocks: [TextBlock], centers: [CGFloat])
    -> [Int: [(colIndex: Int, text: String)]]
{
    guard !blocks.isEmpty else { return [:] }

    var sorted = blocks
    sorted.sort { $0.centerY < $1.centerY }

    var rows: [Int: [(colIndex: Int, text: String)]] = [:]
    var rowIdx = 0
    var lastCY: CGFloat = sorted[0].centerY

    let avgH = sorted.map({ $0.height }).reduce(0, +) / CGFloat(sorted.count)
    let rowGap = max(avgH * 0.6, 6)

    let colCount = centers.count
    let maxColDist = colCount > 0
        ? max(minimalGap(of: centers), 30) * 0.6
        : 30

    for b in sorted {
        let dy = b.centerY - lastCY
        if dy > rowGap { rowIdx += 1 }
        lastCY = b.centerY

        var bestCol = 0
        var bestDist = CGFloat.greatestFiniteMagnitude
        for (i, cx) in centers.enumerated() {
            let d = abs(b.centerX - cx)
            if d < bestDist { bestDist = d; bestCol = i }
        }

        // Clamp far-away blocks to the nearest real column instead of creating
        // phantom columns (e.g. wide spanning cells).
        if bestDist > maxColDist {
            bestCol = min(bestCol, max(colCount - 1, 0))
        }

        if rows[rowIdx] == nil { rows[rowIdx] = [] }
        rows[rowIdx]!.append((min(bestCol, colCount), b.text))
    }
    return rows
}

/// A region is table-like when it has ≥2 rows and an average of >2 populated
/// cells per row.
func isTableRegion(_ rows: [Int: [(colIndex: Int, text: String)]]) -> Bool {
    guard rows.count >= 2 else { return false }
    let avg = Float(rows.values.map({ $0.count }).reduce(0, +)) / Float(rows.count)
    return avg > 2.0 && rows.count > 2
}

/// Build a clean TSV table with the topmost row as header. All rows are padded
/// to `colCount` columns so the structure is consistent. Returns nil when the
/// region is not a valid table.
func formatTableOutput(_ rows: [Int: [(colIndex: Int, text: String)]], colCount: Int) -> String? {
    guard colCount >= 2, rows.count >= 2, isTableRegion(rows) else { return nil }

    let rowIndices = rows.keys.sorted()

    func cellsForRow(_ idx: Int) -> [String] {
        var cells = Array(repeating: "", count: colCount)
        for it in rows[idx] ?? [] {
            if it.colIndex >= 0 && it.colIndex < colCount {
                cells[it.colIndex] = it.text
            } else if colCount > 0 {
                cells[colCount - 1] += (cells[colCount - 1].isEmpty ? "" : " ") + it.text
            }
        }
        return cells
    }

    let lines = rowIndices.map { idx -> String in
        cellsForRow(idx).joined(separator: "\t")
    }

    let result = lines.joined(separator: "\n")
    return result.isEmpty ? nil : result
}

// ═══════════════════════════════════════════════
// MARK: - Main
// ═══════════════════════════════════════════════

guard CommandLine.arguments.count > 1 else { log("Missing path"); exit(1) }

let imagePath = CommandLine.arguments[1]
let imageUrl  = URL(fileURLWithPath: imagePath)

let fm = FileManager.default
guard fm.fileExists(atPath: imagePath) else { log("No file: \(imagePath)"); exit(1) }
if let a = try? fm.attributesOfItem(atPath: imagePath) {
    log("File: \((a[.size] as? NSNumber)?.int64Value ?? 0) bytes")
}

// ── Approach 1: CGImageSource → original first, enhanced fallback ──
if let src = CGImageSourceCreateWithURL(imageUrl as CFURL, nil),
   let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) {
    let imageW = CGFloat(cg.width)
    log("CGImageSource: \(cg.width)×\(cg.height)")

    // 1a. Original image first (clean screenshots OCR best untouched)
    var (rawTexts, blocks) = runVision(on: cg, level: .accurate)
    if rawTexts.isEmpty {
        log("Original accurate empty, trying fast…")
        (rawTexts, blocks) = runVision(on: cg, level: .fast)
    }

    // 1b. Enhanced fallback only when original found very little
    if rawTexts.count < 3 {
        if let enhanced = createEnhancedCGImage(from: CIImage(cgImage: cg)) {
            log("Enhanced fallback…")
            let (eRaw, eBlocks) = runVision(on: enhanced, level: .accurate)
            if eRaw.count > rawTexts.count {
                rawTexts = eRaw
                blocks = eBlocks
            }
        }
    }

    if rawTexts.isEmpty {
        // nothing from original — drop through to other approaches
    } else if blocks.count >= 2 {
        let centers = computeColumnCenters(from: blocks, imageWidth: imageW)
        if centers.count >= 2 {
            let rows = assignToColumns(blocks, centers: centers)
            if let table = formatTableOutput(rows, colCount: centers.count) {
                log("TABLE: \(rows.count) rows × \(centers.count) cols")
                printResult(table)
                exit(0)
            }
        }
        // structured table not confident — fall through to raw text below
        log("RAW: \(rawTexts.count) texts")
        printResult(rawTexts.joined(separator: "\n"))
        exit(0)
    } else {
        log("RAW (single column): \(rawTexts.count) texts")
        printResult(rawTexts.joined(separator: "\n"))
        exit(0)
    }
}

// ── Approach 2: VNImageRequestHandler with file URL ──
log("Fallback: VNImageRequestHandler(url:)…")
let req2 = VNRecognizeTextRequest()
req2.recognitionLevel = .accurate
req2.usesLanguageCorrection = true
req2.automaticallyDetectsLanguage = true
req2.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja-JP", "ko-KR"]
req2.minimumTextHeight = 0.0

var urlTexts: [String] = []
let h2 = VNImageRequestHandler(url: imageUrl, options: [:])
if (try? h2.perform([req2])) != nil {
    for obs in req2.results ?? [] {
        if let t = obs.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines),
           !t.isEmpty { urlTexts.append(t) }
    }
}
if !urlTexts.isEmpty {
    log("OK via URL handler: \(urlTexts.count) texts")
    printResult(urlTexts.joined(separator: "\n"))
    exit(0)
}

// ── Approach 3: NSImage → TIFF → bitmap CGImage ──
log("Fallback: NSImage…")
if let ns = NSImage(contentsOfFile: imagePath),
   let tiff = ns.tiffRepresentation,
   let bmp = NSBitmapImageRep(data: tiff),
   let cg = bmp.cgImage {
    log("NSImage: \(cg.width)×\(cg.height)")

    var (rawTexts, _) = runVision(on: cg, level: .accurate)
    if rawTexts.isEmpty {
        (rawTexts, _) = runVision(on: cg, level: .fast)
    }

    if !rawTexts.isEmpty {
        log("OK via NSImage: \(rawTexts.count) texts")
        printResult(rawTexts.joined(separator: "\n"))
        exit(0)
    }
}

log("All approaches returned no text")
printResult("")
