import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export const reverseGeocode = async (latitude: number, longitude: number): Promise<string | null> => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'OQH-CRM/1.0 (attendance location)',
        'Accept-Language': 'en',
      },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data && typeof data.display_name === 'string' && data.display_name.trim()) {
      return data.display_name;
    }
    return null;
  } catch {
    return null;
  }
};

export const generateEmployeeId = (): string => {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `OQH-${num}`;
};

export const generateClientCode = (): string => {
  const num = Math.floor(100 + Math.random() * 900);
  return `CLT-${num}`;
};

export const generateCardNumber = (): string => {
  const prefix = 'OQHID';
  const num = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${num}`;
};

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const calculateWorkingHours = (checkIn: Date | string, checkOut: Date | string): number => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffMs = end.getTime() - start.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  return parseFloat(hours.toFixed(2));
};

export const LATE_THRESHOLD_HOUR = 10;
export const LATE_THRESHOLD_MINUTE = 15;

export const isLateCheckIn = (time: Date | string): boolean => {
  const d = new Date(time);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  return hours > LATE_THRESHOLD_HOUR || (hours === LATE_THRESHOLD_HOUR && minutes > LATE_THRESHOLD_MINUTE);
};

export const calculateLateMinutes = (time: Date | string): number => {
  const d = new Date(time);
  const totalMinutes = d.getHours() * 60 + d.getMinutes();
  const thresholdMinutes = LATE_THRESHOLD_HOUR * 60 + LATE_THRESHOLD_MINUTE;
  const late = totalMinutes - thresholdMinutes;
  return late > 0 ? Math.round(late) : 0;
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  roleId: number;
}

export const generateTokens = (user: TokenPayload): { accessToken: string; refreshToken: string } => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, roleId: user.roleId },
    process.env.JWT_SECRET || 'default_secret',
    { expiresIn: '1h' as any }
  );

  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_REFRESH_SECRET || 'default_refresh_secret',
    { expiresIn: '7d' as any }
  );

  return { accessToken, refreshToken };
};
