jest.mock("../../config/api", () => ({ __esModule: true, default: { post: jest.fn() } }));

import api from "../../config/api";
import { TranslationError, translateText, translationErrorMessage } from "../translationService";

describe("translateText", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the mobile field names and returns translated_text", async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, translated_text: "नमस्ते" } });
    await expect(translateText(" Hello ", "en", "hi")).resolves.toBe("नमस्ते");
    expect(api.post).toHaveBeenCalledWith(
      "/translate",
      { text: "Hello", source_language: "en", target_language: "hi" },
      expect.objectContaining({ timeout: 20000 })
    );
  });

  it("accepts the legacy `translation` field", async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, translation: "Bonjour" } });
    await expect(translateText("Hello", "en", "fr")).resolves.toBe("Bonjour");
  });

  it("never echoes the input back when the provider fails", async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: false, message: "Translation service is temporarily unavailable." } });
    await expect(translateText("Hello", "en", "hi")).rejects.toThrow("temporarily unavailable");
  });

  it("rejects empty input without calling the server", async () => {
    await expect(translateText("   ", "en", "hi")).rejects.toBeInstanceOf(TranslationError);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("produces friendly messages for server, network and unknown errors", () => {
    expect(translationErrorMessage({ response: { data: { message: "Text is too long" } } })).toBe("Text is too long");
    expect(translationErrorMessage({ request: {} })).toMatch(/internet/);
    expect(translationErrorMessage(new Error("x"))).toMatch(/Translation failed/);
  });
});
