-- CreateTable
CREATE TABLE "role_menu_access" (
    "id" TEXT NOT NULL,
    "role_key" TEXT NOT NULL,
    "menu_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_menu_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_menu_access_role_key_idx" ON "role_menu_access"("role_key");

-- CreateIndex
CREATE UNIQUE INDEX "role_menu_access_role_key_menu_key_key" ON "role_menu_access"("role_key", "menu_key");
