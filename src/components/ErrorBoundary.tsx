/**
 * 文件：src/components/ErrorBoundary.tsx
 * 职责：React 错误边界。捕获子树渲染期/生命周期错误，展示回退 UI（含错误
 *       堆栈），避免单点崩溃拖垮整个应用；name 用于标识出错的 UI 片段。
 * 依赖：react
 * 导出：默认 ErrorBoundary
 */

/**
 * ErrorBoundary - React class component for error isolation.
 *
 * Catches JS errors from descendant components, rendering a fallback UI instead of crashing the whole app.
 * Useful for segmenting riskier or integration-heavy UI subtrees, supports developer hinting via details.
 */
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error boundary wrapper to save Application parts from falling
 * @component ErrorBoundary
 * @param {string} [props.name] - name of the wrapped segment, "Error Boundary" by default
 */
class ErrorBoundary extends Component<Props, State> {
  static defaultProps = {
    name: 'Error Boundary',
  };

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(/* error: Error */) {
    // The next render will show the Error UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Save information to help render Error UI
    this.setState({ error, errorInfo });
    // TODO: Add log error messages to an error reporting service here
  }

  render() {
    if (this.state.hasError) {
      // Error UI rendering
      return (
        <div>
          <h2>{this.props.name} - Something went wrong</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state?.error?.toString()}
            <br />
            {this.state?.errorInfo?.componentStack}
          </details>
        </div>
      );
    }

    // Normal UI rendering
    return this.props.children;
  }
}

export default ErrorBoundary;
