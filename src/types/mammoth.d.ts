declare module 'mammoth' {
  interface ConversionResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface Options {
    arrayBuffer?: ArrayBuffer;
    path?: string;
    buffer?: Buffer;
  }

  function extractRawText(options: Options): Promise<ConversionResult>;
  function convertToHtml(options: Options): Promise<ConversionResult>;

  export default { extractRawText, convertToHtml };
  export { extractRawText, convertToHtml };
}
