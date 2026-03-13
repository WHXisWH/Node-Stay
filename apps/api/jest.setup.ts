import 'dotenv/config';

// テストでは固定シークレットを強制してJWT検証を安定化する
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
