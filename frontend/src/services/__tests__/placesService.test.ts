jest.mock("../../config/api", () => ({ __esModule: true, default: { get: jest.fn() } }));

const mockStore: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore[k] = v;
    }),
  },
}));

import api from "../../config/api";
import { distanceKm, fetchFacilities, fetchOffers, fetchWeather, getCachedWeather } from "../placesService";

const WEATHER = { success: true, temperature_c: 35, feels_like_c: 36, condition: "Overcast", icon: "cloudy", is_day: true, provider: "Open-Meteo" };

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
});

describe("distanceKm", () => {
  it("computes great-circle distance", () => {
    expect(distanceKm(16.69, 74.46, 16.69, 74.46)).toBeCloseTo(0, 5);
    // Ichalkaranji -> Kolhapur is roughly 25-30 km
    const d = distanceKm(16.691, 74.4605, 16.705, 74.2433);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(30);
  });
});

describe("fetchWeather", () => {
  it("sends only ~1 km precision and caches for nearby repeat calls", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: WEATHER });
    const a = await fetchWeather(16.691234, 74.460567);
    expect(api.get).toHaveBeenCalledWith("/weather", expect.objectContaining({ params: { lat: "16.69", lon: "74.46" } }));
    expect(a.temperature_c).toBe(35);
    await fetchWeather(16.692, 74.461); // within 2 km and 10 min -> cache
    expect(api.get).toHaveBeenCalledTimes(1);
    await fetchWeather(16.692, 74.461, true); // forced refresh
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("refetches after moving far and keeps last good value for offline display", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: WEATHER });
    await fetchWeather(16.69, 74.46);
    await fetchWeather(18.91, 72.81);
    expect(api.get).toHaveBeenCalledTimes(2);
    (api.get as jest.Mock).mockRejectedValue({ request: {} });
    await expect(fetchWeather(10, 10)).rejects.toBeTruthy();
    expect((await getCachedWeather())?.condition).toBe("Overcast");
  });

  it("throws on provider error instead of inventing values", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { success: false, message: "Weather service is unavailable" } });
    await expect(fetchWeather(1, 1)).rejects.toThrow("unavailable");
  });
});

describe("fetchFacilities", () => {
  it("does not send coordinates and sorts by distance on the phone", async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: [
        { id: 1, name: "Far", latitude: 18.91, longitude: 72.81, is_verified: true, is_stale: false },
        { id: 2, name: "Near", latitude: 16.7, longitude: 74.46, is_verified: true, is_stale: false },
        { id: 3, name: "No coords", latitude: null, longitude: null, is_verified: false, is_stale: true },
      ],
    });
    const out = await fetchFacilities({ latitude: 16.69, longitude: 74.46 });
    expect((api.get as jest.Mock).mock.calls[0][1]?.params).toBeUndefined();
    expect(out.map((f) => f.id)).toEqual([2, 1, 3]);
    expect(out[0].distance_km).toBeLessThan(2);
    expect(out[2].distance_km).toBeNull();
  });
});

describe("fetchOffers", () => {
  it("returns an empty list for a non-array payload", async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { success: false } });
    await expect(fetchOffers()).resolves.toEqual([]);
  });
});
