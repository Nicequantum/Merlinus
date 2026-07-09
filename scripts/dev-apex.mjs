#!/usr/bin/env node
/** APEX NATIONAL PLATFORM — local dev against live Supabase (.env.apex.local). */
import { spawn } from 'node:child_process';

process.env.APEX_ENV = '1';

const child = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));