import { z } from 'zod';
import { zLatLng, zText } from '../../../common/http/validation.js';
import { LOCATION_LIMITS } from '../location.constants.js';

/**
 * Quy ước dto: một file cho một use case, chứa CẢ schema request lẫn response của use case đó.
 * Không tách thư mục requests/ responses/ — request và response của cùng một API đọc cạnh nhau dễ hơn.
 * Swagger đọc schema zod trực tiếp từ `@Body({ schema })`, response khai qua `zodResponse()`.
 */
export const CreateLocationSchema = z.object({
  name: zText(LOCATION_LIMITS.nameMaxLength),
  ...zLatLng.shape, // lat, lng
  radiusMeters: z
    .number()
    .int()
    .min(LOCATION_LIMITS.radiusMeters.min)
    .max(LOCATION_LIMITS.radiusMeters.max)
    .default(LOCATION_LIMITS.radiusMeters.default),
  isPublic: z.boolean().default(false), // true = ai cũng thấy qua /public/locations/nearby (không kèm thông tin chủ)
});
export type CreateLocation = z.infer<typeof CreateLocationSchema>;
