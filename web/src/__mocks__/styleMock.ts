// Returns the class key as-is so className references in tests are readable.
const styleMock = new Proxy(
  {},
  { get: (_: object, key: string) => key },
);

export default styleMock;
