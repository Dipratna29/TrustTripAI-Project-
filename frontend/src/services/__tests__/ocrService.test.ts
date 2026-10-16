import { NativeModules, Platform } from "react-native";

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async (uri: string, actions: any[]) => ({
    uri: `${uri}#prepared`,
    width: actions.length ? 1600 : 800,
    height: actions.length ? 1200 : 600,
    base64: "BASE64DATA",
  })),
  SaveFormat: { JPEG: "jpeg" },
}));

jest.mock("../../config/api", () => ({ __esModule: true, default: { post: jest.fn() } }));

const mockRecognize = jest.fn();
jest.mock("@react-native-ml-kit/text-recognition", () => ({ __esModule: true, default: { recognize: (...a: any[]) => mockRecognize(...a) } }));

import * as ImageManipulator from "expo-image-manipulator";
import api from "../../config/api";
import { OcrError, prepareImage, recognizeText, scriptForLanguage } from "../ocrService";

const setNative = (present: boolean) => {
  (NativeModules as any).TextRecognition = present ? {} : undefined;
};

describe("scriptForLanguage", () => {
  it("maps languages to ML Kit script models", () => {
    expect(scriptForLanguage("hi")).toBe("Devanagari");
    expect(scriptForLanguage("mr")).toBe("Devanagari");
    expect(scriptForLanguage("auto")).toBe("Devanagari");
    expect(scriptForLanguage("ja")).toBe("Japanese");
    expect(scriptForLanguage("ko")).toBe("Korean");
    expect(scriptForLanguage("zh-CN")).toBe("Chinese");
    expect(scriptForLanguage("fr")).toBe("Latin");
  });
});

describe("prepareImage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("downscales large photos and keeps small ones", async () => {
    setNative(true);
    await prepareImage("file://big.jpg", 4000, 3000);
    expect((ImageManipulator.manipulateAsync as jest.Mock).mock.calls[0][1]).toEqual([{ resize: { width: 1600 } }]);
    await prepareImage("file://small.jpg", 800, 600);
    expect((ImageManipulator.manipulateAsync as jest.Mock).mock.calls[1][1]).toEqual([]);
  });

  it("only requests base64 when the photo must be uploaded (no on-device OCR)", async () => {
    setNative(true);
    await prepareImage("file://a.jpg", 100, 100);
    expect((ImageManipulator.manipulateAsync as jest.Mock).mock.calls[0][2].base64).toBe(false);
    setNative(false);
    await prepareImage("file://a.jpg", 100, 100);
    expect((ImageManipulator.manipulateAsync as jest.Mock).mock.calls[1][2].base64).toBe(true);
  });
});

describe("recognizeText", () => {
  const prepared = { uri: "file://p.jpg", width: 1000, height: 800, base64: "BASE64DATA" };

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = "android";
  });

  it("uses on-device OCR, keeps block frames and line breaks", async () => {
    setNative(true);
    mockRecognize.mockResolvedValue({
      text: "Station  Road\n\nस्टेशन रोड",
      blocks: [
        { text: "Station  Road", frame: { left: 10, top: 20, width: 100, height: 30 } },
        { text: "स्टेशन रोड", frame: { left: 10, top: 60, width: 100, height: 30 } },
      ],
    });
    const out = await recognizeText(prepared, "hi");
    expect(mockRecognize).toHaveBeenCalledWith("file://p.jpg", "Devanagari");
    expect(out.engine).toBe("on-device");
    expect(out.text).toBe("Station Road\nस्टेशन रोड");
    expect(out.blocks).toHaveLength(2);
    expect(out.blocks[0].frame).toEqual({ left: 10, top: 20, width: 100, height: 30 });
    expect(api.post).not.toHaveBeenCalled(); // the photo never leaves the phone
  });

  it("reports NO_TEXT instead of fabricating text", async () => {
    setNative(true);
    mockRecognize.mockResolvedValue({ text: "  ", blocks: [] });
    await expect(recognizeText(prepared, "en")).rejects.toMatchObject({ code: "NO_TEXT" });
  });

  it("wraps native failures in a friendly error", async () => {
    setNative(true);
    mockRecognize.mockRejectedValue(new Error("native crash"));
    await expect(recognizeText(prepared, "en")).rejects.toBeInstanceOf(OcrError);
  });

  it("falls back to the authenticated cloud endpoint without the native module", async () => {
    setNative(false);
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, text: "Menu\nTea", blocks: [{ text: "Menu\nTea" }] } });
    const out = await recognizeText(prepared, "en");
    expect(api.post).toHaveBeenCalledWith("/ocr", expect.objectContaining({ image_base64: "BASE64DATA", language: "en" }), expect.any(Object));
    expect(out.engine).toBe("cloud");
    expect(out.text).toBe("Menu\nTea");
  });

  it("maps cloud 503 to UNAVAILABLE and network loss to a clear message", async () => {
    setNative(false);
    (api.post as jest.Mock).mockRejectedValueOnce({ response: { status: 503 } });
    await expect(recognizeText(prepared, "en")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    (api.post as jest.Mock).mockRejectedValueOnce({ request: {} });
    await expect(recognizeText(prepared, "en")).rejects.toThrow(/internet/);
  });

  it("rejects oversized uploads before sending", async () => {
    setNative(false);
    const huge = { ...prepared, base64: "A".repeat(4 * 1024 * 1024 + 1) };
    await expect(recognizeText(huge, "en")).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(api.post).not.toHaveBeenCalled();
  });
});
