#!/usr/bin/env node
// The Feature Line board's data. The source of truth is one JSON file per feature under
// board/features/. Every write stamps `updatedAt` itself and rebuilds the small files the page
// loads from board/data/, so the page works from file:// and only loads what it shows:
//   data/projects.js   every project with its counts, plus everything waiting on you
//   data/p/<project>.js  one project's features, without stage details
//   data/f/<id>.js     one feature's stage details, loaded when a stage is opened
//   data/search.js     plain text of every detail block, loaded when search opens
//
//   board.mjs project                               this folder's project key (owner/name)
//   board.mjs list [--project <key>] [--open]       summary of features (--open: pr not done)
//   board.mjs get <id>                              one feature's full JSON
//   board.mjs create <id> <json>                    new feature (fails if it exists); its
//                                                   `repo` defaults to this folder's project
//   board.mjs update <id> <json> [--log <text>]     deep-merge fields; arrays replace; null clears
//   board.mjs detail <id> <stage> <json>            add a detail block to a stage, replacing
//                                                   any block with the same title
//   board.mjs log <id> <text>                       add one log line
//   board.mjs session <id>                          record this Claude Code session (and folder)
//                                                   as working on the feature
//   board.mjs open                                  rebuild and open the page on this project
//
// <json> is inline JSON or @path/to/file.json.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const BOARD = join(dirname(fileURLToPath(import.meta.url)), '..', 'board');
const FEATURES = join(BOARD, 'features');
const DATA = join(BOARD, 'data');
const STAGES = ['grill', 'prototype', 'spec', 'tickets', 'build', 'review', 'pr'];
const LOG_LIMIT = 20;
const RECENT_LOG = 5;

const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const fail = (message) => {
  console.error(`board: ${message}`);
  process.exit(1);
};
const pathOf = (id) => {
  if (!/^[A-Za-z0-9._-]+$/.test(id ?? '')) fail(`bad feature id: ${id}`);
  return join(FEATURES, `${id}.json`);
};
const read = (id) => {
  const path = pathOf(id);
  if (!existsSync(path)) fail(`no feature ${id}`);
  return JSON.parse(readFileSync(path, 'utf8'));
};
const parseJson = (arg) => {
  if (arg == null) fail('missing <json>');
  const text = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON: ${error.message}`);
  }
};

// A project is the git remote's owner/name, else the repo folder's name, else this folder's.
function projectOf(dir = process.cwd()) {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const match = git('remote', 'get-url', 'origin').match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/);
    if (match) return match[1];
  } catch {}
  try {
    return basename(git('rev-parse', '--show-toplevel'));
  } catch {}
  return basename(dir);
}
const slug = (key) => String(key || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '__');

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    target[key] = isObject(value) && isObject(target[key]) ? merge({ ...target[key] }, value) : value;
  }
  return target;
}

function addLog(feature, text) {
  feature.log = [...(feature.log ?? []), { at: now(), text }].slice(-LOG_LIMIT);
}

// Stamps when each stage started and finished as its status changes, so the page can show
// how long each stage took. Times already present are kept.
function stampStages(feature, before) {
  const at = now();
  for (const s of STAGES) {
    const stage = feature.stages?.[s];
    if (!stage) continue;
    const was = before?.stages?.[s]?.status ?? 'todo';
    if (stage.status === was) continue;
    if ((stage.status === 'active' || stage.status === 'waiting') && !stage.startedAt) stage.startedAt = at;
    if (stage.status === 'done' && !stage.finishedAt) stage.finishedAt = at;
    if (stage.status === 'active' && was === 'done') delete stage.finishedAt;
  }
}

function write(id, feature, before) {
  stampStages(feature, before);
  feature.updatedAt = now();
  mkdirSync(FEATURES, { recursive: true });
  writeFileSync(pathOf(id), `${JSON.stringify(feature, null, 2)}\n`);
  build();
  console.log(`board: ${id} saved at ${feature.updatedAt}`);
}

function all() {
  if (!existsSync(FEATURES)) return [];
  return readdirSync(FEATURES)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ id: name.slice(0, -5), ...JSON.parse(readFileSync(join(FEATURES, name), 'utf8')) }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

const shipped = (f) => f.stages?.pr?.status === 'done';

// Everything the line and its footer need, without the stage details.
function summary(f) {
  const { stages = {}, log = [], ...rest } = f;
  return {
    ...rest,
    log: log.slice(-RECENT_LOG),
    stages: Object.fromEntries(STAGES.map((s) => [s, {
      status: stages[s]?.status ?? 'todo',
      note: stages[s]?.note ?? '',
      entries: stages[s]?.details?.length ?? 0,
      startedAt: stages[s]?.startedAt,
      finishedAt: stages[s]?.finishedAt,
    }])),
  };
}

// Plain text of every detail block, for the page's search. Loaded only when search opens.
const plain = (text) => String(text ?? '').replace(/[`*_#>]|\[([^\]]+)\]\([^)]+\)/g, (m, label) => label ?? '').replace(/\s+/g, ' ').trim();
function searchEntries(f) {
  const entries = [];
  for (const s of STAGES) {
    (f.stages?.[s]?.details ?? []).forEach((block, t) => {
      const base = { p: f.repo || 'unknown', f: f.id, title: f.title, color: f.color, s, t, block: block.title };
      const items = Array.isArray(block.items) ? block.items : [];
      if (block.kind === 'qa') {
        items.forEach((it) => entries.push({ ...base, text: plain([it.q, it.recommended && `Recommended: ${it.recommended}`, it.answer && `You said: ${it.answer}`].filter(Boolean).join(' — ')) }));
      } else if (block.kind === 'list') {
        entries.push({ ...base, text: plain(items.map((it) => (typeof it === 'string' ? it : [it.text, it.meta].filter(Boolean).join(' '))).join(' · ')) });
      } else {
        entries.push({ ...base, text: plain([block.path, block.body].filter(Boolean).join(' ')) });
      }
    });
  }
  return entries;
}

// Writes a JSONP file only when its content changed, so unchanged files keep their mtime.
function emit(path, callback, payload) {
  const text = `${callback}(${JSON.stringify(payload)});\n`;
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function prune(dir, keep) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) if (!keep.has(name)) rmSync(join(dir, name));
}

function build(opened) {
  const features = all();
  const projects = new Map();
  for (const f of features) {
    const key = f.repo || 'unknown';
    if (!projects.has(key)) projects.set(key, []);
    projects.get(key).push(f);
  }

  const keepProjects = new Set();
  for (const [key, list] of projects) {
    const file = `${slug(key)}.js`;
    keepProjects.add(file);
    emit(join(DATA, 'p', file), 'featureLineProject', { key, features: list.map(summary) });
  }
  prune(join(DATA, 'p'), keepProjects);

  const keepFeatures = new Set();
  for (const f of features) {
    const file = `${f.id}.js`;
    keepFeatures.add(file);
    emit(join(DATA, 'f', file), 'featureLineFeature', {
      id: f.id,
      details: Object.fromEntries(STAGES.map((s) => [s, f.stages?.[s]?.details ?? []])),
    });
  }
  prune(join(DATA, 'f'), keepFeatures);

  mkdirSync(DATA, { recursive: true });
  const previous = existsSync(join(DATA, 'opened.txt')) ? readFileSync(join(DATA, 'opened.txt'), 'utf8') : null;
  if (opened) writeFileSync(join(DATA, 'opened.txt'), opened);
  emit(join(DATA, 'projects.js'), 'featureLineProjects', {
    opened: opened ?? previous,
    projects: [...projects].map(([key, list]) => ({
      key,
      file: `${slug(key)}.js`,
      live: list.filter((f) => !shipped(f)).length,
      shipped: list.filter(shipped).length,
      waiting: list.filter((f) => !shipped(f) && f.waitingOnYou).length,
      updatedAt: list[0]?.updatedAt,
    })),
    waiting: features
      .filter((f) => !shipped(f) && f.waitingOnYou)
      .map((f) => ({
        id: f.id,
        project: f.repo || 'unknown',
        title: f.title,
        color: f.color,
        waitingOnYou: f.waitingOnYou,
        stage: STAGES.find((s) => f.stages?.[s]?.status === 'waiting') ?? null,
      })),
  });
  emit(join(DATA, 'search.js'), 'featureLineSearch', features.flatMap(searchEntries));
  rmSync(join(BOARD, 'data.js'), { force: true });
}

const [command, ...args] = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, value === undefined || value.startsWith('--') ? 1 : 2);
  return value === undefined || value.startsWith('--') ? true : value;
};

switch (command) {
  case 'project':
    console.log(projectOf());
    break;
  case 'list': {
    const project = flag('--project') ?? flag('--repo');
    const open = flag('--open');
    const rows = all()
      .filter((f) => !project || f.repo === project)
      .filter((f) => !open || !shipped(f))
      .map((f) => ({
        id: f.id,
        title: f.title,
        project: f.repo,
        specIssue: f.specIssue ?? null,
        stages: Object.fromEntries(STAGES.map((s) => [s, f.stages?.[s]?.status ?? 'todo'])),
        waitingOnYou: f.waitingOnYou ?? null,
        updatedAt: f.updatedAt,
      }));
    console.log(JSON.stringify(rows, null, 2));
    break;
  }
  case 'get':
    console.log(JSON.stringify(read(args[0]), null, 2));
    break;
  case 'create': {
    const [id, json] = args;
    if (existsSync(pathOf(id))) fail(`${id} already exists; use update`);
    const feature = parseJson(json);
    feature.repo ??= projectOf();
    feature.stages = Object.fromEntries(STAGES.map((s) => [s, { status: 'todo', ...feature.stages?.[s] }]));
    if (!feature.log?.length) addLog(feature, 'Feature started with /feature');
    write(id, feature);
    break;
  }
  case 'update': {
    const logText = flag('--log');
    const [id, json] = args;
    const before = read(id);
    const feature = merge(structuredClone(before), parseJson(json));
    if (typeof logText === 'string') addLog(feature, logText);
    write(id, feature, before);
    break;
  }
  case 'detail': {
    const [id, stage, json] = args;
    if (!STAGES.includes(stage)) fail(`unknown stage ${stage}; one of ${STAGES.join(', ')}`);
    const block = parseJson(json);
    if (!block.title) fail('a detail block needs a title');
    const before = read(id);
    const feature = structuredClone(before);
    feature.stages ??= {};
    feature.stages[stage] ??= { status: 'todo' };
    const blocks = feature.stages[stage].details ?? [];
    const at = blocks.findIndex((b) => b.title === block.title);
    if (at === -1) blocks.push(block);
    else blocks[at] = block;
    feature.stages[stage].details = blocks;
    write(id, feature, before);
    break;
  }
  case 'session': {
    // Records the Claude Code session working on a feature, so the board can lead back to it.
    const id = flag('--id') ?? process.env.CLAUDE_CODE_SESSION_ID;
    const [featureId] = args;
    if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id)) fail('no session id: run inside Claude Code or pass --id <session-id>');
    const before = read(featureId);
    const feature = structuredClone(before);
    const at = now();
    const sessions = feature.sessions ?? [];
    const known = sessions.find((s) => s.id === id);
    if (known) known.lastAt = at;
    else sessions.push({ id, cwd: process.cwd(), firstAt: at, lastAt: at });
    feature.sessions = sessions.slice(-10);
    feature.cwd ??= process.cwd();
    write(featureId, feature, before);
    break;
  }
  case 'log': {
    const [id, ...words] = args;
    const before = read(id);
    const feature = structuredClone(before);
    addLog(feature, words.join(' '));
    write(id, feature, before);
    break;
  }
  case 'open': {
    build(projectOf());
    const page = join(BOARD, 'index.html');
    if (process.platform === 'darwin') execFileSync('open', [page]);
    else if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', page]);
    else execFileSync('xdg-open', [page]);
    break;
  }
  case 'build':
    build();
    break;
  default:
    fail('usage: board.mjs project|list|get|create|update|detail|log|session|open|build … (see the top of this file)');
}
