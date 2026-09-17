import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/http/exceptions.js';
import { decodeCursor, pageOf } from '../../common/http/pagination.js';
import type { CreateLocation } from './dto/create-location.dto.js';
import type { ListLocationsQuery, LocationResponse, NearbyLocationsQuery, PublicLocationResponse } from './dto/location.dto.js';
import { LOCATION_LIMITS } from './location.constants.js';
import { LocationRepository } from './location.repository.js';
import type { SavedLocationRow } from './schema/location.schema.js';

/** Luật nghiệp vụ của location. Không biết HTTP, không viết SQL. Lỗi → AppException với mã trong ErrorCodes. */
@Injectable()
export class LocationService {
  constructor(private readonly repo: LocationRepository) {}

  /** Tạo địa điểm; vượt 20 → CONFLICT LIMIT_REACHED. */
  async create(userId: string, input: CreateLocation): Promise<LocationResponse> {
    if ((await this.repo.countByUser(userId)) >= LOCATION_LIMITS.maxPerUser) {
      throw new AppException('CONFLICT', { reason: 'LIMIT_REACHED', max: LOCATION_LIMITS.maxPerUser });
    }
    const row = await this.repo.insert(userId, {
      name: input.name,
      point: { lat: input.lat, lng: input.lng },
      radiusMeters: input.radiusMeters,
      isPublic: input.isPublic,
    });
    return toResponse(row);
  }

  /** Trang địa điểm của user, mới nhất trước, kèm nextCursor. */
  async list(userId: string, query: ListLocationsQuery) {
    const rows = await this.repo.findPage(userId, query.limit + 1, decodeCursor(query.cursor));
    return pageOf(rows.map(toResponse), query.limit, (r) => ({ createdAt: r.createdAt, id: r.id }));
  }

  /** Chi tiết; không có hoặc của người khác → NOT_FOUND. */
  async get(userId: string, id: string): Promise<LocationResponse> {
    const row = await this.repo.findById(userId, id);
    if (!row) throw new AppException('NOT_FOUND', { resource: 'location', id }); // của người khác cũng là NOT_FOUND (không lộ)
    return toResponse(row);
  }

  /** Xoá; không có hoặc của người khác → NOT_FOUND. */
  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.repo.deleteById(userId, id))) throw new AppException('NOT_FOUND', { resource: 'location', id });
  }

  /** API public: chỉ địa điểm chủ nhân đã bật isPublic, trả trường an toàn. Không có userId vì không đăng nhập. */
  async nearbyPublic(query: NearbyLocationsQuery): Promise<PublicLocationResponse[]> {
    const rows = await this.repo.findPublicWithin({ lat: query.lat, lng: query.lng }, query.radiusMeters);
    return rows.map((r) => ({ id: r.id, name: r.name, lat: r.point.lat, lng: r.point.lng, distanceMeters: Math.round(r.distanceMeters) }));
  }
}

/** Row DB → shape trả client (tách lat/lng, ISO date). Một chỗ duy nhất map, controller không tự map. */
function toResponse(row: SavedLocationRow): LocationResponse {
  return {
    id: row.id,
    name: row.name,
    lat: row.point.lat,
    lng: row.point.lng,
    radiusMeters: row.radiusMeters,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
  };
}
