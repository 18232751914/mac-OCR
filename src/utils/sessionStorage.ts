type StorageValue = string | number | boolean | object | bigint;

/**
 * Smartly reads value from sessionStorage
 */
export function sessionStorageGet(name: string, defaultValue: unknown = ''): StorageValue {
  const valueFromStore = sessionStorage.getItem(name);
  if (valueFromStore === null) return defaultValue as StorageValue; // No value in store, return default one

  try {
    const jsonParsed = JSON.parse(valueFromStore);
    if (['string', 'number', 'boolean', 'boolean', 'bigint', 'object'].includes(typeof jsonParsed)) {
      return jsonParsed; // We successfully parse JS value from the store
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Do nothing, we will return string value as it is
  }

  return valueFromStore; // Return string value as it is
}

/**
 * Smartly writes value into sessionStorage
 */
export function sessionStorageSet(name: string, value: unknown) {
  if (typeof value === 'undefined') {
    return; // Do not store undefined values
  }
  let valueAsString: string;
  if (typeof value === 'object') {
    valueAsString = JSON.stringify(value);
  } else {
    valueAsString = String(value);
  }

  sessionStorage.setItem(name, valueAsString);
}

/**
 * Deletes value by name from sessionStorage, if specified name is empty entire sessionStorage is cleared.
 */
export function sessionStorageDelete(name: string) {
  if (name) {
    sessionStorage.removeItem(name);
  } else {
    sessionStorage.clear();
  }
}
