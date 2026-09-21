/** Hằng số nghiệp vụ của location (địa điểm đã lưu). Đổi luật chơi → đổi ở đây, không rải số trong service. */
export const LOCATION_LIMITS = {
  maxPerUser: 20, // mỗi user lưu tối đa 20 địa điểm
  nameMaxLength: 60,
  radiusMeters: { min: 100, max: 5_000, default: 500 }, // bán kính quan tâm quanh địa điểm
  nearbyMaxMeters: 20_000, // GET /locations/nearby không cho quét quá 20 km
} as const;
