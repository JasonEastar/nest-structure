import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/http/exceptions.js';
import { AppConfigRepository } from './app-config.repository.js';
import { type AppConfig, type UpsertConfig, toAppConfig } from './dto/config.dto.js';

/** Config động: client đọc bản public; admin tạo/sửa/xoá. Không cache: bảng nhỏ, đọc theo index name, client tự cache qua Cache-Control. */
@Injectable()
export class AppConfigService {
  constructor(private readonly repo: AppConfigRepository) {}

  /** Bản public cho web/app (chỉ `is_public = true`); `names` rỗng → tất cả, tên lạ bỏ qua. */
  async listPublic(names: string[]): Promise<AppConfig[]> {
    return (await this.repo.findMany(names, true)).map(toAppConfig);
  }

  /** Admin xem mọi config (kể cả private). */
  async list(names: string[]): Promise<AppConfig[]> {
    return (await this.repo.findMany(names, false)).map(toAppConfig);
  }

  /** Tạo mới; trùng tên → CONFLICT (field name). */
  async create(input: UpsertConfig): Promise<AppConfig> {
    if (await this.repo.nameExists(input.name)) throw new AppException('CONFLICT', { field: 'name' });
    return toAppConfig(await this.repo.insert(input));
  }

  /** Thay toàn bộ (name, data, isPublic); không có → NOT_FOUND. */
  async update(id: string, input: UpsertConfig): Promise<AppConfig> {
    if (await this.repo.nameExists(input.name, id)) throw new AppException('CONFLICT', { field: 'name' });
    const row = await this.repo.update(id, input);
    if (!row) throw new AppException('NOT_FOUND', { id });
    return toAppConfig(row);
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repo.deleteById(id))) throw new AppException('NOT_FOUND', { id });
  }
}
