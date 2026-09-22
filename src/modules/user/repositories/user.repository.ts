import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm';
import { type Db, DRIZZLE } from '../../../common/database/drizzle.js';
import type { SupabaseClaims } from '../../../common/auth/supabase.js';
import { profiles, roles, userRoles } from '../schema/user.schema.js';
import type { UpdateMe } from '../dto/update-me.dto.js';
import type { AdminUserRow, UserStatus } from '../dto/admin-user.dto.js';
import { SYSTEM_ROLE } from '../user.constants.js';
import type { Cursor } from '../../../common/http/pagination.js';

const adminUserColumns = {
  id: profiles.id,
  email: profiles.email,
  displayName: profiles.displayName,
  username: profiles.username,
  avatarUrl: profiles.avatarUrl,
  status: profiles.status,
  statusReason: profiles.statusReason,
  createdAt: profiles.createdAt,
};

/** SQL của bảng profiles (+ gán role `user` lần đầu, cùng transaction). Role/permission: role.repository.ts. */
@Injectable()
export class UserRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Tạo profile + role `user` CHỈ khi profile chưa có (ON CONFLICT DO NOTHING + RETURNING: 2 instance cùng chạy vẫn một dòng;
   * profile đã có thì không gán lại `user` — admin đã đổi role hoặc tạo tài khoản với role khác). Trả status hiện tại.
   */
  async insertProfileIfMissing(claims: SupabaseClaims): Promise<{ status: UserStatus }> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(profiles)
        .values({
          id: claims.sub,
          email: claims.email ?? null,
          displayName: claims.fullName?.trim() || claims.email?.split('@')[0] || 'Người dùng C9',
          avatarUrl: claims.avatarUrl ?? null,
        })
        .onConflictDoNothing({ target: profiles.id })
        .returning({ id: profiles.id });

      const [defaultRole] = inserted.length
        ? await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, SYSTEM_ROLE.user)).limit(1)
        : [];
      if (defaultRole) {
        await tx
          .insert(userRoles)
          .values({ userId: claims.sub, roleId: defaultRole.id })
          .onConflictDoNothing();
      }
      const [row] = await tx.select({ status: profiles.status }).from(profiles).where(eq(profiles.id, claims.sub)).limit(1);
      return { status: (row?.status ?? 'active') as UserStatus };
    });
  }

  /** Profile theo id (= sub Supabase); null nếu chưa có. */
  async findProfile(userId: string) {
    const [row] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        displayName: profiles.displayName,
        username: profiles.username,
        avatarUrl: profiles.avatarUrl,
        locale: profiles.locale,
        homeCityCode: profiles.homeCityCode,
        phoneVerifiedAt: profiles.phoneVerifiedAt,
        status: profiles.status,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row ?? null;
  }

  /** Cập nhật các field gửi lên. */
  async updateProfile(userId: string, patch: UpdateMe): Promise<void> {
    await this.db
      .update(profiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
  }

  /** Một dòng cho admin (kèm status, createdAt); null nếu không có. */
  async findAdminUser(userId: string): Promise<AdminUserRow | null> {
    const [row] = await this.db.select(adminUserColumns).from(profiles).where(eq(profiles.id, userId)).limit(1);
    return row ?? null;
  }

  /** Trang user cho admin, mới nhất trước; `q` tìm theo email hoặc tên (ILIKE). Lấy `limit + 1` để biết còn trang sau. */
  async findAdminUsersPage(limit: number, cursor?: Cursor, q?: string): Promise<AdminUserRow[]> {
    const afterCursor = cursor
      ? or(
          lt(profiles.createdAt, new Date(cursor.createdAt)),
          and(eq(profiles.createdAt, new Date(cursor.createdAt)), lt(profiles.id, cursor.id)),
        )
      : undefined;
    const pattern = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined; // % _ \ trong q là ký tự thường, không phải wildcard
    const search = pattern ? or(ilike(profiles.email, pattern), ilike(profiles.displayName, pattern)) : undefined;
    return this.db
      .select(adminUserColumns)
      .from(profiles)
      .where(and(afterCursor, search))
      .orderBy(desc(profiles.createdAt), desc(profiles.id))
      .limit(limit);
  }

  /** Khoá / mở khoá. */
  async updateStatus(userId: string, status: UserStatus, reason: string | null): Promise<void> {
    await this.db
      .update(profiles)
      .set({ status, statusReason: reason, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
  }

  /** Hard delete, cascade user_roles. */
  async deleteProfile(userId: string): Promise<void> {
    await this.db.delete(profiles).where(eq(profiles.id, userId));
  }

  /** Có profile không (kiểm trước khi gán role). */
  async profileExists(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    return Boolean(row);
  }
}
