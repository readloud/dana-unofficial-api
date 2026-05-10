import dotenv from 'dotenv';
dotenv.config();
export const BASE = process.env.API_BASE || 'http://localhost:3000';
