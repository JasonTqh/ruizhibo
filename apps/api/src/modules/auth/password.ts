import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const ALGORITHM = "scrypt";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export function validateAdminPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    return "管理员密码长度必须为 12-128 位";
  }
  if (!/[a-z]/.test(password)) {
    return "管理员密码必须包含小写字母";
  }
  if (!/[A-Z]/.test(password)) {
    return "管理员密码必须包含大写字母";
  }
  if (!/\d/.test(password)) {
    return "管理员密码必须包含数字";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "管理员密码必须包含特殊字符";
  }
  return null;
}

export async function hashPassword(password: string) {
  const validationError = validateAdminPassword(password);
  if (validationError) {
    throw new Error(validationError);
  }

  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string) {
  const parts = encodedHash.split("$");
  if (parts.length !== 6) {
    return false;
  }

  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] =
    parts;
  if (
    algorithm !== ALGORITHM ||
    Number(cost) !== COST ||
    Number(blockSize) !== BLOCK_SIZE ||
    Number(parallelization) !== PARALLELIZATION
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expectedHash = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expectedHash.length !== KEY_LENGTH) {
      return false;
    }

    const actualHash = await deriveKey(password, salt);
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
        } else {
          resolve(derivedKey);
        }
      },
    );
  });
}
