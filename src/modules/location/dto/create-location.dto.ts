import { z } from 'zod';
import { zLatLng, zText } from '../../../common/http/validation.js';
import { LOCATION_LIMITS } from '../location.constants.js';

/** Một file dto cho một use case: request + response + mapper. Swagger đọc zod trực tiếp. */
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
}).meta({ id: 'CreateLocation' }); // id → mục Schemas trên Swagger + tên type khi mobile codegen
export type CreateLocation = z.infer<typeof CreateLocationSchema>;
