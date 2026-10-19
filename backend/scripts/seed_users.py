import asyncio
import uuid
from sqlalchemy import text
from app.db.session import AsyncSessionLocal
from app.core.security import hash_password

async def seed():
    async with AsyncSessionLocal() as db:
        tid = "00000000-0000-0000-0000-000000000001"
        await db.execute(text(f"SELECT set_config('app.current_tenant_id', '{tid}', false)"))

        # Ensure tenant 'ajimsha-holding' exists or update slug
        await db.execute(text("UPDATE tenants SET slug = 'ajimsha-holding' WHERE id = '00000000-0000-0000-0000-000000000001'"))

        users = [
            ("ajimsha@ledgerae.local", "AjimshaSecure2026!", "Ajimsha Founder", "أجيمشا المؤسس", "owner"),
            ("admin@ledgerae.local", "AdminSecure2026!", "System Administrator", "مدير النظام", "admin"),
        ]

        for email, pwd, name_en, name_ar, role in users:
            uid = str(uuid.uuid4())
            pwd_hash = hash_password(pwd)
            await db.execute(
                text("""
                    INSERT INTO users (id, tenant_id, email, password_hash, full_name_en, full_name_ar, role, is_active, is_2fa_enabled)
                    VALUES (:id, :tenant_id, :email, :password_hash, :full_name_en, :full_name_ar, :role, true, false)
                    ON CONFLICT (email) DO UPDATE SET
                        password_hash = EXCLUDED.password_hash,
                        tenant_id = EXCLUDED.tenant_id,
                        full_name_en = EXCLUDED.full_name_en,
                        role = EXCLUDED.role,
                        is_active = true,
                        is_2fa_enabled = false
                """),
                {
                    "id": uid,
                    "tenant_id": tid,
                    "email": email,
                    "password_hash": pwd_hash,
                    "full_name_en": name_en,
                    "full_name_ar": name_ar,
                    "role": role,
                }
            )
            print(f"Upserted user: {email} ({role})")

        await db.commit()
        print("Seeding completed successfully!")

if __name__ == '__main__':
    asyncio.run(seed())
