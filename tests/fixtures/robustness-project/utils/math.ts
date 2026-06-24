export const { add, multiply } = {
  add: (a: number, b: number) => a + b,
  multiply: (a: number, b: number) => a * b
};
export const [sub, div] = [
  (a: number, b: number) => a - b,
  (a: number, b: number) => a / b
];
