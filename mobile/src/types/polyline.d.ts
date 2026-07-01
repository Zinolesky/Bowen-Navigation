declare module "@mapbox/polyline" {
  const polyline: {
    decode(value: string): [number, number][];
    encode(value: [number, number][]): string;
  };
  export default polyline;
}

