'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { useTelegram } from '@/context/TelegramContext';
import {
  getDefaultRunnerConfig,
  type RunnerConfig,
  type RunnerPayoutDefinition
} from '@/lib/config/runner-default';
import { buildTelegramAuthHeaders } from '@/lib/telegram';

type GameMode = 'menu' | 'running' | 'paused' | 'gameover';

interface Hero {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  onGround: boolean;
  canDoubleJump: boolean;
}

interface Obstacle {
  x: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  kind: 'block' | 'drift';
  bumpiness: number;
  driftVariant: number;
  driftProfile: number[];
}

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

interface Snowflake {
  x: number;
  y: number;
  speedY: number;
  driftX: number;
  radius: number;
  spin: number;
  wobble: number;
  alpha: number;
}

interface SnowPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  life: number;
}

interface EngineState {
  hero: Hero;
  obstacles: Obstacle[];
  stars: Star[];
  snowflakes: Snowflake[];
  snowPuffs: SnowPuff[];
  time: number;
  spawnTimer: number;
  speedMultiplier: number;
  score: number;
  distance: number;
  running: boolean;
}

interface RunnerBalanceDto {
  available: number;
  reserved: number;
}

interface RunnerStatusDto {
  freeAttemptsRemaining: number;
  cooldownSecondsRemaining: number;
  attemptCost: number;
}

interface RunnerHistoryDto {
  id: string;
  score: number;
  distance: number;
  cost: number;
  reward: number;
  freeAttempt: boolean;
  createdAt: string;
}

interface RunnerApiResponse {
  config: RunnerConfig;
  status: RunnerStatusDto;
  history: RunnerHistoryDto[];
  balance: RunnerBalanceDto;
}

interface RunnerStartApiResponse {
  result: {
    attemptId: string;
    cost: number;
    freeAttempt: boolean;
    balance: RunnerBalanceDto;
    status: RunnerStatusDto;
  };
}

interface RunnerFinishApiResponse {
  result: {
    reward: number;
    thresholdsUnlocked: RunnerPayoutDefinition[];
    balance: RunnerBalanceDto;
    status: RunnerStatusDto;
  };
  history: RunnerHistoryDto[];
}

const DEFAULT_CONFIG = getDefaultRunnerConfig();

const GRAVITY = 2600;
const JUMP_VELOCITY = -1100;
const DOUBLE_JUMP_VELOCITY = -960;
const BASE_SPEED = 320;
const SPEED_GAIN = 0.05;
const SPAWN_INTERVAL_RANGE: readonly [number, number] = [2.4, 3.8];

const HERO_COLOR = '#fbbf24'; // Gold astronaut
const HERO_OUTLINE = '#d97706';
const TRAIL_COLOR = 'rgba(252, 211, 77, 0.35)';
const SNOW_COLOR = 'rgba(240, 250, 255, 0.85)';
const SNOW_GROUND_TOP = 'rgba(245, 252, 255, 0.92)';
const SNOW_GROUND_BOTTOM = 'rgba(160, 210, 245, 0.16)';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

const DRIFT_VARIANTS = 7;
const DRIFT_PROFILE_POINTS = 9;

function createDriftProfile(variant: number, bumpiness: number): number[] {
  const v = ((variant % DRIFT_VARIANTS) + DRIFT_VARIANTS) % DRIFT_VARIANTS;
  const b = clamp01(bumpiness);

  const base: Record<number, number[]> = {
    // Rounded hill
    0: [0, 0.18, 0.46, 0.78, 1, 0.84, 0.54, 0.22, 0],
    // Sharp peak
    1: [0, 0.14, 0.38, 0.7, 1, 0.62, 0.28, 0.12, 0],
    // Double hump
    2: [0, 0.22, 0.7, 0.48, 0.92, 0.6, 0.34, 0.16, 0],
    // Long ramp up, short drop
    3: [0, 0.12, 0.24, 0.42, 0.62, 0.86, 1, 0.52, 0],
    // Short ramp up, long plateau then down
    4: [0, 0.22, 0.55, 0.86, 0.92, 0.88, 0.7, 0.34, 0],
    // Asymmetric ridge
    5: [0, 0.1, 0.32, 0.7, 0.96, 1, 0.72, 0.3, 0],
    // Jagged snowbank
    6: [0, 0.24, 0.52, 0.86, 0.66, 0.98, 0.6, 0.28, 0]
  };

  const profile = (base[v] ?? base[0]).slice(0, DRIFT_PROFILE_POINTS);
  // Micro-noise to make shapes feel less copy-paste, but still deterministic-ish per bumpiness.
  for (let i = 1; i < profile.length - 1; i += 1) {
    const phase = (i / (profile.length - 1)) * Math.PI * 2;
    const wobble = Math.sin(phase * (1.5 + v * 0.2)) * 0.035;
    const rough = (Math.cos(phase * (2.2 + v * 0.15)) * 0.022 + wobble) * (0.35 + b * 0.65);
    profile[i] = clamp01(profile[i] + rough);
  }

  // Ensure ends are exactly ground
  profile[0] = 0;
  profile[profile.length - 1] = 0;

  // Boost peak a bit with bumpiness
  const peakIndex = Math.floor(profile.length / 2);
  profile[peakIndex] = clamp01(profile[peakIndex] + 0.06 * b);

  return profile;
}

function getDriftSurfaceY(obstacle: Obstacle, ground: number, x: number): number {
  const left = obstacle.x;
  const right = obstacle.x + obstacle.width;
  if (x <= left) {
    return ground;
  }
  if (x >= right) {
    return ground;
  }

  const t = (x - left) / obstacle.width;
  const profile = obstacle.driftProfile;
  if (!profile.length) {
    return ground - obstacle.height;
  }
  const n = profile.length;
  const idx = t * (n - 1);
  const i0 = Math.max(0, Math.min(n - 2, Math.floor(idx)));
  const i1 = i0 + 1;
  const localT = idx - i0;
  const h0 = profile[i0];
  const h1 = profile[i1];
  const h = lerp(h0, h1, localT);
  return ground - obstacle.height * h;
}

function isRunnerApiResponse(value: unknown): value is RunnerApiResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.config === 'object' && typeof record.status === 'object' && record.balance !== undefined;
}

function isRunnerStartResponse(value: unknown): value is RunnerStartApiResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const result = record.result as Record<string, unknown> | undefined;
  return (
    !!result &&
    typeof result.attemptId === 'string' &&
    typeof result.cost === 'number' &&
    typeof result.balance === 'object' &&
    typeof result.status === 'object'
  );
}

function isRunnerFinishResponse(value: unknown): value is RunnerFinishApiResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const result = record.result as Record<string, unknown> | undefined;
  return (
    !!result &&
    typeof result.reward === 'number' &&
    typeof result.balance === 'object' &&
    typeof result.status === 'object'
  );
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }
  const candidate = (payload as { error?: unknown }).error;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : fallback;
}

function createInitialHero(width: number, height: number): Hero {
  const heroWidth = clamp(width * 0.12, 56, 72);
  const heroHeight = heroWidth * 1.28;
  const ground = height * 0.78;
  return {
    x: width * 0.18,
    y: ground - heroHeight,
    width: heroWidth,
    height: heroHeight,
    velocityY: 0,
    onGround: true,
    canDoubleJump: true
  };
}

function createInitialStars(width: number, height: number): Star[] {
  const count = Math.floor(width * 0.12);
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 24 + Math.random() * 64,
      size: Math.random() * 1.3 + 0.6,
      alpha: Math.random() * 0.4 + 0.2
    });
  }
  return stars;
}

function createInitialSnowflakes(width: number, height: number): Snowflake[] {
  const count = clamp(Math.floor(width * 0.12), 32, 110);
  const snowflakes: Snowflake[] = [];
  for (let i = 0; i < count; i += 1) {
    snowflakes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      speedY: 26 + Math.random() * 80,
      driftX: (Math.random() - 0.5) * 42,
      radius: 1.2 + Math.random() * 1.8,
      spin: Math.random() * Math.PI * 2,
      wobble: 0.6 + Math.random() * 1.6,
      alpha: 0.22 + Math.random() * 0.55
    });
  }
  return snowflakes;
}

function createEngineState(width: number, height: number, holiday: boolean): EngineState {
  return {
    hero: createInitialHero(width, height),
    obstacles: [],
    stars: createInitialStars(width, height),
    snowflakes: holiday ? createInitialSnowflakes(width, height) : [],
    snowPuffs: [],
    time: 0,
    spawnTimer: 1.2,
    speedMultiplier: 1,
    score: 0,
    distance: 0,
    running: false
  };
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  holiday: boolean,
  time: number,
  speedMultiplier: number
): void {
  const pace = (holiday ? 9.5 : 8) * speedMultiplier;
  const bob = Math.sin(time * pace) * (hero.onGround ? 3 : 1.5);
  const tilt = clamp(hero.velocityY / 1600, -0.28, 0.28) + (hero.onGround ? Math.sin(time * pace) * 0.04 : 0);
  const centerX = hero.x + hero.width / 2;
  const centerY = hero.y + hero.height / 2 + bob;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(tilt);

  const x = -hero.width / 2;
  const y = -hero.height / 2;

  const W = hero.width, H = hero.height;
  const legSwing = hero.onGround ? Math.sin(time * 8 * speedMultiplier) : 0;

  // === BODY SUIT ===
  const bodyGrad = ctx.createLinearGradient(x, y, x + W, y + H);
  bodyGrad.addColorStop(0, '#fbbf24');
  bodyGrad.addColorStop(0.5, '#f59e0b');
  bodyGrad.addColorStop(1, '#d97706');
  ctx.fillStyle = bodyGrad;
  const radius = W * 0.28;
  ctx.beginPath();
  ctx.moveTo(x + radius, y + H * 0.22);
  ctx.lineTo(x + W - radius, y + H * 0.22);
  ctx.quadraticCurveTo(x + W, y + H * 0.22, x + W, y + H * 0.22 + radius);
  ctx.lineTo(x + W, y + H * 0.82);
  ctx.lineTo(x, y + H * 0.82);
  ctx.lineTo(x, y + H * 0.22 + radius);
  ctx.quadraticCurveTo(x, y + H * 0.22, x + radius, y + H * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1.5; ctx.stroke();

  // Body stripe
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x + W * 0.38, y + H * 0.30, W * 0.06, H * 0.45);

  // Legs (animated)
  const legW = W * 0.28, legH = H * 0.22;
  const legY = y + H * 0.80;
  // Left leg
  ctx.save();
  ctx.translate(x + W * 0.28, legY);
  ctx.rotate(legSwing * 0.35);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-legW/2, 0, legW, legH);
  // Boot
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-legW/2, legH * 0.6, legW * 1.1, legH * 0.4);
  ctx.restore();
  // Right leg
  ctx.save();
  ctx.translate(x + W * 0.72, legY);
  ctx.rotate(-legSwing * 0.35);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-legW/2, 0, legW, legH);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-legW/2, legH * 0.6, legW * 1.1, legH * 0.4);
  ctx.restore();

  // Arms
  const armSwing = legSwing * 0.4;
  // Left arm
  ctx.save();
  ctx.translate(x + W * 0.08, y + H * 0.35);
  ctx.rotate(armSwing);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, W * 0.16, H * 0.32);
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(0, H * 0.28, W * 0.16, H * 0.1);
  ctx.restore();
  // Right arm
  ctx.save();
  ctx.translate(x + W * 0.76, y + H * 0.35);
  ctx.rotate(-armSwing);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, W * 0.16, H * 0.32);
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(0, H * 0.28, W * 0.16, H * 0.1);
  ctx.restore();

  // === HELMET ===
  const helmetGrad = ctx.createRadialGradient(x + W*0.45, y + H*0.12, 2, x+W*0.5, y+H*0.12, W*0.4);
  helmetGrad.addColorStop(0, '#fde68a');
  helmetGrad.addColorStop(0.6, '#fbbf24');
  helmetGrad.addColorStop(1, '#d97706');
  ctx.fillStyle = helmetGrad;
  ctx.beginPath();
  ctx.ellipse(x + W * 0.5, y + H * 0.18, W * 0.42, H * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1.5; ctx.stroke();

  // Visor (dark glass)
  const visorGrad = ctx.createLinearGradient(x + W*0.25, y + H*0.1, x + W*0.75, y + H*0.28);
  visorGrad.addColorStop(0, 'rgba(14,165,233,0.85)');
  visorGrad.addColorStop(1, 'rgba(2,132,199,0.6)');
  ctx.fillStyle = visorGrad;
  ctx.beginPath();
  ctx.ellipse(x + W * 0.5, y + H * 0.18, W * 0.28, H * 0.155, 0, 0, Math.PI * 2);
  ctx.fill();
  // Visor shine
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(x + W * 0.42, y + H * 0.12, W * 0.1, H * 0.06, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Helmet glow (space effect)
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = hero.onGround ? 6 : 12;
  ctx.strokeStyle = 'rgba(251,191,36,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x + W * 0.5, y + H * 0.18, W * 0.43, H * 0.245, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (!holiday) {
    ctx.restore();
    return;
  }

  const hatBaseY = y - hero.height * 0.06;
  const brimHeight = hero.height * 0.13;
  const brimRadius = hero.width * 0.22;
  const brimX = x + hero.width * 0.16;
  const brimW = hero.width * 0.72;

  // Fur brim (fluffy)
  const furBase = ctx.createLinearGradient(0, hatBaseY, 0, hatBaseY + brimHeight);
  furBase.addColorStop(0, 'rgba(255,255,255,0.96)');
  furBase.addColorStop(1, 'rgba(210,245,255,0.78)');
  ctx.fillStyle = furBase;
  ctx.beginPath();
  ctx.moveTo(brimX + brimRadius, hatBaseY);
  ctx.lineTo(brimX + brimW - brimRadius, hatBaseY);
  ctx.quadraticCurveTo(brimX + brimW, hatBaseY, brimX + brimW, hatBaseY + brimRadius);
  ctx.lineTo(brimX + brimW, hatBaseY + brimHeight - brimRadius);
  ctx.quadraticCurveTo(brimX + brimW, hatBaseY + brimHeight, brimX + brimW - brimRadius, hatBaseY + brimHeight);
  ctx.lineTo(brimX + brimRadius, hatBaseY + brimHeight);
  ctx.quadraticCurveTo(brimX, hatBaseY + brimHeight, brimX, hatBaseY + brimHeight - brimRadius);
  ctx.lineTo(brimX, hatBaseY + brimRadius);
  ctx.quadraticCurveTo(brimX, hatBaseY, brimX + brimRadius, hatBaseY);
  ctx.closePath();
  ctx.fill();
  // Fur texture dots
  for (let i = 0; i < 10; i += 1) {
    const fx = brimX + (i / 9) * brimW;
    const fy = hatBaseY + brimHeight * (0.35 + Math.sin(i * 0.9) * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(fx, fy, 1.6 + (i % 3) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hat body with gradient + fold highlight
  const hatTopX = brimX + brimW * 0.52;
  const hatTopY = hatBaseY - hero.height * 0.36;
  const body = ctx.createLinearGradient(brimX, hatTopY, brimX + brimW, hatBaseY + brimHeight);
  body.addColorStop(0, 'rgba(248,113,113,0.98)');
  body.addColorStop(0.55, 'rgba(239,68,68,0.98)');
  body.addColorStop(1, 'rgba(190,18,60,0.92)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(brimX + brimW * 0.08, hatBaseY + brimHeight * 0.22);
  ctx.quadraticCurveTo(brimX + brimW * 0.58, hatBaseY + brimHeight * 0.1, brimX + brimW * 0.92, hatBaseY + brimHeight * 0.25);
  ctx.quadraticCurveTo(brimX + brimW * 0.74, hatTopY + hero.height * 0.04, hatTopX, hatTopY);
  ctx.quadraticCurveTo(brimX + brimW * 0.34, hatTopY + hero.height * 0.06, brimX + brimW * 0.08, hatBaseY + brimHeight * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(brimX + brimW * 0.22, hatBaseY + brimHeight * 0.28);
  ctx.quadraticCurveTo(brimX + brimW * 0.52, hatBaseY + brimHeight * 0.05, brimX + brimW * 0.8, hatBaseY + brimHeight * 0.3);
  ctx.stroke();

  // Pom-pom (fluffy)
  const pomX = hatTopX + hero.width * 0.06;
  const pomY = hatTopY + hero.height * 0.02;
  const pomR = hero.width * 0.095;
  const pomGlow = ctx.createRadialGradient(pomX, pomY, 0, pomX, pomY, pomR * 2.2);
  pomGlow.addColorStop(0, 'rgba(255,255,255,0.85)');
  pomGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pomGlow;
  ctx.beginPath();
  ctx.arc(pomX, pomY, pomR * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(pomX, pomY, pomR, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i += 1) {
    ctx.fillStyle = 'rgba(210,245,255,0.55)';
    ctx.beginPath();
    ctx.arc(
      pomX + (Math.sin(i * 1.2) * pomR) * 0.45,
      pomY + (Math.cos(i * 0.9) * pomR) * 0.45,
      1.4,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Scarf with sway
  const scarfY = y + hero.height * 0.58;
  const scarfX = x + hero.width * 0.12;
  const sway = Math.sin(time * (pace * 0.55)) * 6;
  ctx.fillStyle = 'rgba(251,191,36,0.95)';
  ctx.beginPath();
  ctx.roundRect(scarfX, scarfY, hero.width * 0.76, hero.height * 0.12, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(249,115,22,0.9)';
  ctx.beginPath();
  ctx.roundRect(scarfX + hero.width * 0.42, scarfY + hero.height * 0.12, hero.width * 0.16, hero.height * 0.28, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(scarfX + hero.width * 0.55, scarfY + hero.height * 0.14, hero.width * 0.16, hero.height * 0.3, 5);
  ctx.fill();
  ctx.save();
  ctx.translate(scarfX + hero.width * 0.62, scarfY + hero.height * 0.32);
  ctx.rotate((sway * Math.PI) / 180);
  ctx.fillStyle = 'rgba(249,115,22,0.75)';
  ctx.beginPath();
  ctx.roundRect(0, 0, hero.width * 0.28, hero.height * 0.16, 6);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stars: Star[],
  snowflakes: Snowflake[],
  scroll: number,
  ground: number
): void {
  const holiday = snowflakes.length > 0;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, holiday ? '#041022' : '#050b18');
  gradient.addColorStop(0.45, holiday ? '#061a2f' : '#091427');
  gradient.addColorStop(1, holiday ? '#02040b' : '#020309');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (holiday) {
    const hillLayer = (offset: number, amplitude: number, color: string, speed: number) => {
      const wave = clamp(width * 0.08, 30, 60);
      const shift = ((scroll * speed) % (wave * 2) + wave * 2) % (wave * 2);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-wave, ground - offset);
      for (let x = -wave; x <= width + wave; x += wave) {
        const y = ground - offset - Math.sin((x + shift) / (wave * 0.9)) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width + wave, ground + 80);
      ctx.lineTo(-wave, ground + 80);
      ctx.closePath();
      ctx.fill();
    };

    hillLayer(height * 0.42, 18, 'rgba(15,23,42,0.85)', 0.04);
    hillLayer(height * 0.32, 26, 'rgba(30,41,59,0.65)', 0.08);
  }

  const aurora = ctx.createRadialGradient(width * 0.62, height * 0.18, 0, width * 0.62, height * 0.18, width);
  aurora.addColorStop(0, holiday ? 'rgba(165,243,252,0.12)' : 'rgba(34,211,238,0.10)');
  aurora.addColorStop(0.35, holiday ? 'rgba(147,197,253,0.12)' : 'rgba(99,102,241,0.10)');
  aurora.addColorStop(0.7, holiday ? 'rgba(74,222,128,0.07)' : 'rgba(16,185,129,0.06)');
  aurora.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aurora;
  ctx.fillRect(0, 0, width, height);

  if (holiday) {
    // Top icicles silhouette (subtle, behind gameplay)
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'rgba(210,245,255,0.65)';
    const count = Math.floor(width / 54);
    for (let i = 0; i < count; i += 1) {
      const x = i * 54 + (i % 3) * 6;
      const w = 26 + (i % 4) * 6;
      const h = 18 + (i % 5) * 10;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
      ctx.quadraticCurveTo(x + w * 0.62, h * 0.72, x + w * 0.5, h);
      ctx.quadraticCurveTo(x + w * 0.38, h * 0.72, x, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = TRAIL_COLOR;
  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (snowflakes.length) {
    ctx.fillStyle = SNOW_COLOR;
    for (const flake of snowflakes) {
      ctx.globalAlpha = flake.alpha;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fill();

      if (flake.radius > 2.2) {
        ctx.globalAlpha = Math.min(1, flake.alpha + 0.15);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1;
        const len = flake.radius * 2.4;
        ctx.beginPath();
        ctx.moveTo(flake.x - len, flake.y);
        ctx.lineTo(flake.x + len, flake.y);
        ctx.moveTo(flake.x, flake.y - len);
        ctx.lineTo(flake.x, flake.y + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  const groundGradient = ctx.createLinearGradient(0, ground, 0, height);
  groundGradient.addColorStop(0, holiday ? SNOW_GROUND_TOP : 'rgba(6,7,11,0.85)');
  groundGradient.addColorStop(1, holiday ? SNOW_GROUND_BOTTOM : 'rgba(6,7,11,0.35)');
  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, ground, width, height - ground);

  if (holiday) {
    const snowLine = ctx.createLinearGradient(0, ground - 28, 0, ground + 22);
    snowLine.addColorStop(0, 'rgba(255,255,255,0.16)');
    snowLine.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = snowLine;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    const wave = clamp(width * 0.06, 18, 36);
    for (let x = 0; x <= width; x += wave) {
      const y = ground + Math.sin(x / (wave * 1.3)) * 6 + Math.sin(x / (wave * 0.7)) * 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Snow texture sparkles on path (stable + scrolling)
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const dots = Math.floor(width * 0.14);
    const scrollX = ((scroll * 38) % width + width) % width;
    for (let i = 0; i < dots; i += 1) {
      const seed = i * 1103515245 + 12345;
      const pr1 = ((seed >>> 0) % 1000) / 1000;
      const pr2 = (((seed + 1013904223) >>> 0) % 1000) / 1000;
      const x = (pr1 * width + scrollX) % width;
      const y = ground + 10 + pr2 * (height - ground - 18);
      const r = 0.35 + (i % 5) * 0.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (holiday) {
    const haze = ctx.createLinearGradient(0, 0, 0, ground);
    haze.addColorStop(0, 'rgba(200,255,255,0.08)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, ground);
  }
}

function drawSnowPuffs(ctx: CanvasRenderingContext2D, puffs: SnowPuff[]): void {
  if (!puffs.length) {
    return;
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const puff of puffs) {
    ctx.globalAlpha = Math.max(0, Math.min(1, puff.alpha));
    const glow = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, puff.radius * 2.6);
    glow.addColorStop(0, `rgba(255,255,255,${0.18 + puff.alpha * 0.3})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.radius * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(245,252,255,0.9)';
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, ground: number, holiday: boolean): void {
  const { x, width, height, color, kind, bumpiness, driftProfile } = obstacle;
  const y = ground - height;

  if (holiday && kind === 'drift') {
    const drift = ctx.createLinearGradient(x, y, x, ground);
    drift.addColorStop(0, 'rgba(255,255,255,0.92)');
    drift.addColorStop(0.45, 'rgba(225,245,255,0.72)');
    drift.addColorStop(1, 'rgba(90,140,170,0.12)');
    ctx.fillStyle = drift;

    const points = driftProfile.length ? driftProfile : createDriftProfile(0, bumpiness);
    const topY = points.map((p) => ground - height * p);

    ctx.beginPath();
    ctx.moveTo(x, ground);
    ctx.lineTo(x, topY[0]);

    // Smooth polyline via quadratic midpoints
    for (let i = 1; i < points.length - 1; i += 1) {
      const prevX = x + ((i - 1) / (points.length - 1)) * width;
      const prevY = topY[i - 1];
      const currX = x + (i / (points.length - 1)) * width;
      const currY = topY[i];
      const midX = (prevX + currX) / 2;
      const midY = (prevY + currY) / 2;
      ctx.quadraticCurveTo(prevX, prevY, midX, midY);
    }
    // Last segment
    const lastIndex = points.length - 1;
    const lastX = x + width;
    const lastY = topY[lastIndex];
    const preLastX = x + ((lastIndex - 1) / (points.length - 1)) * width;
    const preLastY = topY[lastIndex - 1];
    ctx.quadraticCurveTo(preLastX, preLastY, lastX, lastY);

    ctx.lineTo(x + width, ground);
    ctx.closePath();
    ctx.fill();

    // Crisp highlight along the drift surface
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, topY[0] + 1.5);
    for (let i = 1; i < points.length; i += 1) {
      const px = x + (i / (points.length - 1)) * width;
      const py = topY[i] + 1.5 + Math.sin((i + bumpiness) * 1.3) * 0.6;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Soft shadow at base
    ctx.fillStyle = 'rgba(2,6,12,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + width * 0.5, ground + 6, width * 0.52, 10 + height * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const gradient = ctx.createLinearGradient(x, y, x, ground);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, 'rgba(9,9,12,0.7)');
  ctx.fillStyle = gradient;
  const radius = Math.max(10, height * 0.18);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, ground);
  ctx.lineTo(x, ground);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // Glow effect on obstacle
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height * 0.4);
  ctx.lineTo(x, y + height * 0.4);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Shine highlight
  const shine = ctx.createLinearGradient(x, y, x + width * 0.5, y);
  shine.addColorStop(0, 'rgba(255,255,255,0.15)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width * 0.5, y);
  ctx.lineTo(x + width * 0.5, y + height * 0.5);
  ctx.lineTo(x, y + height * 0.5);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function updateEngine(state: EngineState, delta: number, width: number, height: number): void {
  state.time += delta;
  const ground = height * 0.78;
  const hero = state.hero;
  const obstacles = state.obstacles;
  const stars = state.stars;
  const snowflakes = state.snowflakes;
  const snowPuffs = state.snowPuffs;

  for (const star of stars) {
    star.x -= (star.speed + BASE_SPEED * 0.2) * delta;
    if (star.x < -4) {
      star.x = width + Math.random() * 40;
      star.y = Math.random() * ground * 0.9;
      star.speed = 24 + Math.random() * 64;
      star.size = Math.random() * 1.4 + 0.6;
      star.alpha = Math.random() * 0.4 + 0.2;
    }
  }

  if (snowflakes.length) {
    const wind = Math.sin(state.time * 0.9) * 22;
    for (const flake of snowflakes) {
      flake.spin += flake.wobble * delta;
      flake.y += flake.speedY * delta;
      const sway = Math.sin(flake.spin) * 18;
      flake.x += (flake.driftX + wind + sway) * delta;
      if (flake.y > ground + 22) {
        flake.y = -12;
        flake.x = Math.random() * width;
        flake.speedY = 26 + Math.random() * 80;
        flake.driftX = (Math.random() - 0.5) * 42;
        flake.radius = 1.2 + Math.random() * 1.8;
        flake.wobble = 0.6 + Math.random() * 1.6;
        flake.alpha = 0.22 + Math.random() * 0.55;
      }
      if (flake.x < -24) {
        flake.x = width + 24;
      } else if (flake.x > width + 24) {
        flake.x = -24;
      }
    }
  }

  hero.velocityY += GRAVITY * delta;
  hero.y += hero.velocityY * delta;
  const wasOnGround = hero.onGround;
  if (hero.y >= ground - hero.height) {
    hero.y = ground - hero.height;
    hero.velocityY = 0;
    hero.onGround = true;
    hero.canDoubleJump = true;

    if (snowflakes.length && !wasOnGround) {
      const baseX = hero.x + hero.width * 0.52;
      const baseY = ground - 2;
      for (let i = 0; i < 10; i += 1) {
        snowPuffs.push({
          x: baseX + (Math.random() - 0.5) * hero.width * 0.7,
          y: baseY + (Math.random() - 0.5) * 4,
          vx: -40 - Math.random() * 60,
          vy: -60 - Math.random() * 60,
          radius: 1.2 + Math.random() * 1.6,
          alpha: 0.55 + Math.random() * 0.25,
          life: 0.42 + Math.random() * 0.22
        });
      }
    }
  } else {
    hero.onGround = false;
  }

  if (snowPuffs.length) {
    for (const puff of snowPuffs) {
      puff.life -= delta;
      puff.x += puff.vx * delta;
      puff.y += puff.vy * delta;
      puff.vx *= 0.92;
      puff.vy += 260 * delta;
      puff.alpha *= 0.92;
      puff.radius *= 1.01;
    }
    state.snowPuffs = snowPuffs.filter((p) => p.life > 0 && p.alpha > 0.05);
  }

  state.speedMultiplier += SPEED_GAIN * delta;

  state.spawnTimer -= delta;
  if (state.spawnTimer <= 0) {
    const obstacleWidth = clamp(width * (0.1 + Math.random() * 0.08), 60, 120);
    const isHoliday = snowflakes.length > 0;
    const obstacleHeight = clamp(
      ground * (isHoliday ? (0.14 + Math.random() * 0.1) : (0.18 + Math.random() * 0.12)),
      52,
      ground * (isHoliday ? 0.28 : 0.33)
    );
    const palette = snowflakes.length
      ? ['#38bdf8', '#f87171', '#34d399', '#a78bfa', '#fbbf24']
      : ['#fbbf24', '#38bdf8', '#c084fc', '#f97316'];
    const color = palette[Math.floor(Math.random() * palette.length)];

    const bumpiness = Math.random();
    const driftVariant = isHoliday ? Math.floor(Math.random() * DRIFT_VARIANTS) : 0;
    const driftProfile = isHoliday ? createDriftProfile(driftVariant, bumpiness) : [];

    obstacles.push({
      x: width + obstacleWidth,
      width: obstacleWidth,
      height: obstacleHeight,
      speed: BASE_SPEED * state.speedMultiplier,
      color,
      kind: isHoliday ? 'drift' : 'block',
      bumpiness,
      driftVariant,
      driftProfile
    });
    const [min, max] = SPAWN_INTERVAL_RANGE;
    state.spawnTimer = (min + Math.random() * (max - min)) / state.speedMultiplier;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= obstacle.speed * delta;
    obstacle.speed = BASE_SPEED * state.speedMultiplier;
  }
  if (obstacles.length && obstacles[0].x + obstacles[0].width < -32) {
    obstacles.shift();
  }

  state.distance += BASE_SPEED * state.speedMultiplier * delta * 0.01;
  state.score = Math.floor(state.distance * 0.1);
}

function detectCollision(hero: Hero, obstacle: Obstacle, ground: number): boolean {
  const heroLeft = hero.x;
  const heroRight = hero.x + hero.width;
  const heroTop = hero.y;
  const heroBottom = hero.y + hero.height;
  const obstacleLeft = obstacle.x;
  const obstacleRight = obstacle.x + obstacle.width;

  if (!(heroRight > obstacleLeft && heroLeft < obstacleRight)) {
    return false;
  }

  if (obstacle.kind !== 'drift') {
    const obstacleTop = ground - obstacle.height;
    const obstacleBottom = ground;
    return heroBottom > obstacleTop && heroTop < obstacleBottom;
  }

  // Drift: collide against the actual surface curve (more precise than a rectangle)
  const overlapLeft = Math.max(heroLeft, obstacleLeft);
  const overlapRight = Math.min(heroRight, obstacleRight);

  const samples = 7;
  const padding = 2;
  const sampleLeft = overlapLeft + padding;
  const sampleRight = overlapRight - padding;
  if (sampleRight <= sampleLeft) {
    return false;
  }

  for (let i = 0; i < samples; i += 1) {
    const t = samples === 1 ? 0.5 : i / (samples - 1);
    const x = lerp(sampleLeft, sampleRight, t);
    const surfaceY = getDriftSurfaceY(obstacle, ground, x);
    if (heroBottom >= surfaceY) {
      return true;
    }
  }

  return false;
}

export default function RunnerGame(): React.JSX.Element {
  const { initDataRaw } = useTelegram();
  const holidayMode = false; // winter mode disabled
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const engineRef = useRef<EngineState | null>(null);
  const achievedThresholdsRef = useRef<Set<number>>(new Set());
  const lastTimestampRef = useRef<number>(0);

  const [mode, setMode] = useState<GameMode>('menu');
  const [hud, setHud] = useState({ score: 0, distance: 0, best: 0 });
  const hudRef = useRef(hud);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [attemptCost, setAttemptCost] = useState<number>(DEFAULT_CONFIG.attemptCost);
  const [freeAttemptsPerDay, setFreeAttemptsPerDay] = useState<number | null>(
    DEFAULT_CONFIG.freeAttemptsPerDay ?? null
  );
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(
    DEFAULT_CONFIG.cooldownSeconds ?? null
  );
  const [payouts, setPayouts] = useState<RunnerPayoutDefinition[]>(DEFAULT_CONFIG.payouts);
  const [achievedThresholds, setAchievedThresholds] = useState<number[]>([]);

  const [balance, setBalance] = useState<RunnerBalanceDto>({ available: 0, reserved: 0 });
  const [serverStatus, setServerStatus] = useState<RunnerStatusDto | null>(null);
  const [historyEntries, setHistoryEntries] = useState<RunnerHistoryDto[]>([]);
  const [isServerMode, setIsServerMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAwaitingServer, setIsAwaitingServer] = useState<boolean>(false);
  const pendingAttemptRef = useRef<string | null>(null);

  // Headers будут создаваться динамически в каждом запросе для свежести initDataRaw

  const showToast = useCallback((message: string, duration = 2200) => {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, duration);
  }, []);

  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const loadRunnerData = useCallback(
    async (signal?: AbortSignal) => {
      if (!initDataRaw) {
        setIsServerMode(false);
        setBalance({ available: 0, reserved: 0 });
        setHistoryEntries([]);
        setServerStatus(null);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const authHeaders = buildTelegramAuthHeaders(initDataRaw);
        const response = await fetch('/api/mini-app/games/runner', {
          headers: authHeaders,
          signal
        });

        const payloadRaw: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRunnerApiResponse(payloadRaw)) {
          throw new Error(extractErrorMessage(payloadRaw, 'Не удалось загрузить раннер.'));
        }

        const payload: RunnerApiResponse = payloadRaw;
        setAttemptCost(payload.config.attemptCost);
        setFreeAttemptsPerDay(
          typeof payload.config.freeAttemptsPerDay === 'number' ? payload.config.freeAttemptsPerDay : null
        );
        setCooldownSeconds(
          typeof payload.config.cooldownSeconds === 'number' ? payload.config.cooldownSeconds : null
        );
        setPayouts(payload.config.payouts);
        achievedThresholdsRef.current = new Set();
        setAchievedThresholds([]);

        setBalance(payload.balance ?? { available: 0, reserved: 0 });
        setServerStatus(payload.status);
        setHistoryEntries(payload.history ?? []);
        setIsServerMode(true);
      } catch (fetchError) {
        if (signal?.aborted) {
          return;
        }
        setIsServerMode(false);
        const message = fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить раннер.';
        setError(message);
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [initDataRaw]
  );

  useEffect(() => {
    if (!initDataRaw) {
      setIsServerMode(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    void loadRunnerData(controller.signal);
    return () => controller.abort();
  }, [initDataRaw, loadRunnerData]);

  const beginServerAttempt = useCallback(async (): Promise<boolean> => {
    if (!initDataRaw) {
      console.error('[RUNNER] No initDataRaw available');
      return false;
    }
    setIsAwaitingServer(true);
    try {
      const authHeaders = buildTelegramAuthHeaders(initDataRaw);
      console.log('[RUNNER] Starting attempt with headers:', Object.keys(authHeaders));
      const response = await fetch('/api/mini-app/games/runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ action: 'start' })
      });
      
      console.log('[RUNNER] Response status:', response.status);

      const payloadRaw: unknown = await response.json().catch((e) => {
        console.error('[RUNNER] JSON parse error:', e);
        return null;
      });
      
      console.log('[RUNNER] Response payload:', payloadRaw);
      
      if (!response.ok) {
        const errorMsg = extractErrorMessage(payloadRaw, 'Не удалось начать забег.');
        console.error('[RUNNER] API error:', response.status, errorMsg);
        throw new Error(errorMsg);
      }
      
      if (!isRunnerStartResponse(payloadRaw)) {
        console.error('[RUNNER] Invalid response format:', payloadRaw);
        throw new Error('Неверный формат ответа от сервера.');
      }

      const payload: RunnerStartApiResponse = payloadRaw;
      console.log('[RUNNER] Attempt started:', payload.result.attemptId);
      pendingAttemptRef.current = payload.result.attemptId;
      setBalance(payload.result.balance ?? { available: 0, reserved: 0 });
      setServerStatus(payload.result.status);
      setError(null);
      return true;
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Не удалось начать забег.';
      setError(message);
      showToast(message, 2600);
      return false;
    } finally {
      setIsAwaitingServer(false);
    }
  }, [initDataRaw, showToast]);

  const finalizeServerAttempt = useCallback(
    async (score: number, distance: number) => {
      if (!initDataRaw || !pendingAttemptRef.current) {
        return;
      }

      const attemptId = pendingAttemptRef.current;
      setIsAwaitingServer(true);
      try {
        const authHeaders = buildTelegramAuthHeaders(initDataRaw);
        const response = await fetch('/api/mini-app/games/runner', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            action: 'finish',
            attemptId,
            score,
            distance
          })
        });

        const payloadRaw: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRunnerFinishResponse(payloadRaw)) {
          throw new Error(extractErrorMessage(payloadRaw, 'Не удалось завершить забег.'));
        }

        const payload: RunnerFinishApiResponse = payloadRaw;
        pendingAttemptRef.current = null;
        setBalance(payload.result.balance ?? { available: 0, reserved: 0 });
        setServerStatus(payload.result.status);
        setHistoryEntries(payload.history ?? []);
        setError(null);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Не удалось завершить забег.';
        setError(message);
        showToast(message, 2600);
      } finally {
        setIsAwaitingServer(false);
      }
    },
    [initDataRaw, showToast]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const parent = canvas.parentElement;
    const width = parent?.clientWidth ?? window.innerWidth;
    const height = parent?.clientHeight ?? window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    contextRef.current = ctx;

    engineRef.current = createEngineState(width, height, holidayMode);
    setHud((prev) => ({ ...prev, score: 0, distance: 0 }));
  }, [holidayMode]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [resizeCanvas]);

  const updateHudFromEngine = useCallback((engine: EngineState) => {
    const score = Math.floor(engine.score);
    const distance = Math.floor(engine.distance);
    let best = hudRef.current.best;
    if (score > best) {
      best = score;
    }
    if (
      score !== hudRef.current.score ||
      distance !== hudRef.current.distance ||
      best !== hudRef.current.best
    ) {
      const snapshot = { score, distance, best };
      hudRef.current = snapshot;
      setHud(snapshot);
    }
  }, []);

  const runFrame = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      const engine = engineRef.current;
      if (!canvas || !ctx || !engine) {
        return;
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ground = height * 0.78;

      if (!engine.running) {
        drawBackground(ctx, width, height, engine.stars, engine.snowflakes, engine.distance, ground);
        drawSnowPuffs(ctx, engine.snowPuffs);
        drawHero(ctx, engine.hero, holidayMode, engine.time, engine.speedMultiplier);
        updateHudFromEngine(engine);
        animationFrameRef.current = window.requestAnimationFrame(runFrame);
        return;
      }

      if (!engineRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(runFrame);
        return;
      }

      const engineState = engineRef.current;
      if (!engineState) {
        animationFrameRef.current = window.requestAnimationFrame(runFrame);
        return;
      }

      const lastTimestamp = lastTimestampRef.current;
      const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
      lastTimestampRef.current = timestamp;

      updateEngine(engineState, delta, width, height);
      drawBackground(ctx, width, height, engineState.stars, engineState.snowflakes, engineState.distance, ground);
      for (const obstacle of engineState.obstacles) {
        drawObstacle(ctx, obstacle, ground, holidayMode);
      }
      drawSnowPuffs(ctx, engineState.snowPuffs);
      drawHero(ctx, engineState.hero, holidayMode, engineState.time, engineState.speedMultiplier);

      let collided = false;
      for (const obstacle of engineState.obstacles) {
        if (detectCollision(engineState.hero, obstacle, ground)) {
          collided = true;
          break;
        }
      }

      if (collided) {
        engineState.running = false;
        const thresholds = payouts.filter((p) => engineState.score >= p.threshold);
        for (const threshold of thresholds) {
          achievedThresholdsRef.current.add(threshold.threshold);
        }
        setAchievedThresholds(Array.from(achievedThresholdsRef.current).sort((a, b) => a - b));
        updateHudFromEngine(engineState);
        setMode('gameover');
        showToast('Столкновение! Попробуйте снова.', 2600);

        if (isServerMode) {
          void finalizeServerAttempt(Math.floor(engineState.score), Math.floor(engineState.distance));
        }
      } else {
        updateHudFromEngine(engineState);
      }

      animationFrameRef.current = window.requestAnimationFrame(runFrame);
    },
    [finalizeServerAttempt, holidayMode, isServerMode, payouts, showToast, updateHudFromEngine]
  );

  useEffect(() => {
    animationFrameRef.current = window.requestAnimationFrame(runFrame);
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [runFrame]);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    engineRef.current = createEngineState(width, height, holidayMode);
    achievedThresholdsRef.current = new Set();
    setAchievedThresholds([]);
    lastTimestampRef.current = 0;
    setHud((prev) => ({ ...prev, score: 0, distance: 0 }));
  }, [holidayMode]);

  const attemptJump = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.running) {
      return;
    }
    const hero = engine.hero;
    if (hero.onGround) {
      hero.velocityY = JUMP_VELOCITY;
      hero.onGround = false;
      hero.canDoubleJump = true;
    } else if (hero.canDoubleJump) {
      hero.velocityY = DOUBLE_JUMP_VELOCITY;
      hero.canDoubleJump = false;
    }
  }, []);

  const beginRun = useCallback(
    async (toastMessage: string) => {
      if (engineRef.current?.running || isAwaitingServer) {
        return;
      }

      if (isServerMode) {
        if (pendingAttemptRef.current) {
          showToast('Предыдущая попытка ещё обрабатывается.', 2400);
          return;
        }
        const allowed = await beginServerAttempt();
        if (!allowed) {
          return;
        }
      }

      resetGame();
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      engine.running = true;
      setMode('running');
      showToast(toastMessage, 1800);
    },
    [beginServerAttempt, isAwaitingServer, isServerMode, resetGame, showToast]
  );

  const pauseGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.running) {
      return;
    }
    engine.running = false;
    setMode('paused');
    showToast('Пауза', 1600);
  }, [showToast]);

  const resumeGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.running) {
      return;
    }
    engine.running = true;
    setMode('running');
    showToast('Продолжение', 1600);
  }, [showToast]);

  const backToMenu = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.running = false;
    }
    resetGame();
    setMode('menu');
    pendingAttemptRef.current = null;
  }, [resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handlePointerDown = () => {
      if (mode === 'running') {
        attemptJump();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && mode === 'running') {
        event.preventDefault();
        attemptJump();
      } else if (event.code === 'KeyP' && mode === 'running') {
        event.preventDefault();
        pauseGame();
      } else if (event.code === 'KeyR' && mode === 'paused') {
        event.preventDefault();
        resumeGame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('touchstart', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('touchstart', handlePointerDown);
    };
  }, [attemptJump, mode, pauseGame, resumeGame]);

  const freeAttemptsLeft = serverStatus ? serverStatus.freeAttemptsRemaining : freeAttemptsPerDay ?? 0;
  const cooldownRemaining = serverStatus ? serverStatus.cooldownSecondsRemaining : cooldownSeconds ?? 0;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden text-white">
      {/* Компактный хедер */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Баланс</span>
            <div className="text-sm font-bold text-white">{balance.available} ★</div>
          </div>
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Очки</span>
            <div className="text-sm font-bold text-yellow-300">{hud.score}</div>
          </div>
          {holidayMode ? (
            <div className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 backdrop-blur-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">❄️ New Year</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="rounded-lg border border-white/20 bg-black/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] uppercase tracking-wider text-white/60">Дистанция</span>
            <div className="text-xs font-bold text-white">{hud.distance}м</div>
          </div>
        </div>
      </div>

      {/* Игровое поле - занимает большую часть экрана */}
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-b from-[#060a18] to-[#020309] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <canvas 
          ref={canvasRef} 
          className="h-full w-full touch-none select-none" 
          style={{ imageRendering: 'pixelated' }}
        />

        {holidayMode ? (
          <>
            <IciclesOverlay className="-top-2 opacity-75" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_65%)]"
            />
          </>
        ) : null}
        
        {/* Overlay для паузы */}
        {mode === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/20 bg-black/80 px-6 py-4 backdrop-blur-md">
              <div className="text-center text-lg font-bold text-white">Пауза</div>
            </div>
          </div>
        )}

        {/* Overlay для gameover */}
        {mode === 'gameover' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-red-900/40 to-orange-900/40 px-6 py-4 backdrop-blur-md animate-pulse">
              <div className="text-center text-xl font-bold text-white mb-2">Игра окончена!</div>
              <div className="text-center text-sm text-white/80">Очки: {hud.score}</div>
            </div>
          </div>
        )}
      </div>

      {/* Компактная панель управления */}
      <div className="flex flex-col gap-2 px-2 py-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/50">
          <span>Свободно: {freeAttemptsLeft}</span>
          <span>Кулдаун: {cooldownRemaining > 0 ? `${cooldownRemaining}с` : 'нет'}</span>
        </div>
        
        <div className="flex gap-2">
          {mode === 'menu' && (
            <button
              className="flex-1 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-3 text-sm font-bold uppercase tracking-wider text-black shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xl hover:from-yellow-300 hover:to-orange-400"
              disabled={isAwaitingServer || isLoading}
              onClick={() => void beginRun('Забег начался!')}
              type="button"
            >
              Старт
            </button>
          )}

          {mode === 'running' && (
            <button
              className="flex-1 rounded-xl border-2 border-white/30 bg-black/40 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-all active:scale-95 hover:border-white/50"
              onClick={pauseGame}
              type="button"
            >
              Пауза
            </button>
          )}

          {mode === 'paused' && (
            <>
              <button
                className="flex-1 rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all active:scale-95 hover:shadow-xl"
                onClick={resumeGame}
                type="button"
              >
                Продолжить
              </button>
              <button
                className="flex-1 rounded-xl border-2 border-white/30 bg-black/40 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-all active:scale-95 hover:border-white/50"
                onClick={backToMenu}
                type="button"
              >
                В меню
              </button>
            </>
          )}

          {mode === 'gameover' && (
            <>
              <button
                className="flex-1 rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-3 text-sm font-bold uppercase tracking-wider text-black shadow-lg transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-xl"
                disabled={isAwaitingServer}
                onClick={() => void beginRun('Новая попытка!')}
                type="button"
              >
                Снова
              </button>
              <button
                className="flex-1 rounded-xl border-2 border-white/30 bg-black/40 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-all active:scale-95 hover:border-white/50"
                onClick={backToMenu}
                type="button"
              >
                Меню
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast уведомления */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-4 top-20 z-50 flex justify-center animate-bounce">
          <div className="rounded-full border border-white/30 bg-black/90 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-xl backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-x-4 top-16 z-50 rounded-xl border border-red-400/50 bg-red-900/40 px-3 py-2 text-xs text-red-100 backdrop-blur-md animate-pulse">
          {error}
        </div>
      )}
    </div>
  );
}
