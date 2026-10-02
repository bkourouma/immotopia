-- CreateTable
CREATE TABLE "signup_attempts" (
    "id" BIGSERIAL NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signup_attempts_ip_hash_created_at_idx" ON "signup_attempts"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "signup_attempts_created_at_idx" ON "signup_attempts"("created_at");
