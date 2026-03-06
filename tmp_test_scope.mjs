// Test script to verify module-level arrow function false positives
const METHOD_REGEX =
  /(?:async\s+)?(?!(?:if|switch|case|while|for|catch)\b)(\b\w+)\s*(?:\((.*?)\)\s*{|=\s*(?:async\s+)?(?!\(\s*(?:async\s+)?\()(?:\((.*?)\)|(\w+))\s*=>\s*{)/g;

const lwcCode = `
import { LightningElement } from 'lwc';

// Module-level helper (SHOULD NOT MATCH)
const myHelper = () => {
  return 'helper';
};

// Module-level async helper (SHOULD NOT MATCH)
const myAsyncHelper = async (data) => {
  return data;
};

// Exported helper (SHOULD NOT MATCH)
export const exportedHelper = (a, b) => {
  return a + b;
};

export default class MyComponent extends LightningElement {
  // Class method (SHOULD MATCH)
  connectedCallback() {
  }

  // Class arrow property (SHOULD MATCH)
  handleClick = (e) => {
  }
}
`;

console.log('=== Testing METHOD_REGEX on LWC Code ===\n');
METHOD_REGEX.lastIndex = 0;
const matches = [...lwcCode.matchAll(METHOD_REGEX)];

for (const m of matches) {
  const methodName = m[1];
  console.log(`MATCHED: ${methodName}`);
  console.log(`  Full match: "${m[0]}"`);
}
