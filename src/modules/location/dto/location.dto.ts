import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/http/pagination.js';
import { LOCATION_LIMITS } from '../location.constants.js';

/** Response của một địa điểm — dùng cho GET/POST/list. Ngày giờ ở dạng ISO string (UTC). */
export const LocationResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusMeters: z.number().int(),
  isPublic: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type LocationResponse = z.infer<typeof LocationResponseSchema>;

/** GET /locations?cursor=&limit= */
export const ListLocationsQuerySchema = PaginationQuerySchema;
export type ListLocationsQuery = z.infer<typeof ListLocationsQuerySchema>;

/** GET /public/locations/nearby?lat=&lng=&radiusMeters= — địa điểm CÔNG KHAI trong bán kính quanh một điểm, không cần đăng nhập. */
export const NearbyLocationsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1).max(LOCATION_LIMITS.nearbyMaxMeters).default(1_000),
});
export type NearbyLocationsQuery = z.infer<typeof NearbyLocationsQuerySchema>;

/** Response public: chỉ trường an toàn (không chủ, không bán kính riêng), kèm khoảng cách (mét) từ điểm truy vấn. */
export const PublicLocationResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  distanceMeters: z.number(),
});
export type PublicLocationResponse = z.infer<typeof PublicLocationResponseSchema>;

