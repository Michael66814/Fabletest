#!/usr/bin/env node
/* Würfelflug und Kurvenfieber – ein Spiel in EINE Datei packen (Stil und Skripte eingebettet).

   Aufruf:  node tools/build.js                    ->  dist/wuerfelflug.html
                                                       (eine Datei zum Weitergeben, läuft per Doppelklick)
            node tools/build.js rennen             ->  dist/kurvenfieber.html (das 3D-Rennen)
            node tools/build.js [rennen] --fragment <Datei>
                                                   ->  Seiteninhalt ohne <html>/<head>/<body>,
                                                       z. B. zum Veröffentlichen als Claude-Artefakt */
'use strict';

const fs = require('fs');
const path = require('path');

const GAMES = {
  wuerfelflug: { dir: '', out: 'wuerfelflug.html' },
  rennen: { dir: 'rennen', out: 'kurvenfieber.html' }
};
const gameName = process.argv.slice(2).find(a => GAMES[a]) || 'wuerfelflug';
const game = GAMES[gameName];
const root = path.join(__dirname, '..', game.dir);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function build(fragment) {
  const html = read('index.html');

  const pick = (re, what) => {
    const m = html.match(re);
    if (!m) throw new Error('index.html: ' + what + ' nicht gefunden');
    return m[0];
  };
  const title = pick(/<title>[^<]*<\/title>/, 'Titel');
  const viewportSides = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/, 'claude:viewport-fit-sides');
  const fonts = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, 'Schrift-Link');
  const cssHref = pick(/<link rel="stylesheet" href="css\/[^"]+">/, 'Stylesheet').match(/href="([^"]+)"/)[1];
  const style = '<style>\n' + read(cssHref).trim() + '\n</style>';

  // Skripte in der Reihenfolge aus index.html einbetten
  const scripts = [];
  let body = pick(/<body>[\s\S]*<\/body>/, '<body>').replace(/^<body>\s*|\s*<\/body>$/g, '');
  body = body.replace(/[ \t]*<script src="([^"]+)"><\/script>\s*/g, (all, src) => {
    const code = read(src).trim();
    if (/<\/script/i.test(code)) throw new Error(src + ' enthält "</script" und kann nicht eingebettet werden');
    scripts.push('/* ---- ' + src + ' ---- */\n' + code);
    return '';
  }).trim();
  if (!scripts.length) throw new Error('index.html: keine Skripte gefunden');
  const script = '<script>\n' + scripts.join('\n\n') + '\n</script>';

  if (fragment) {
    return [
      title,
      viewportSides,
      fonts,
      style,
      body,
      '<script>document.documentElement.lang = "de";</script>',
      script
    ].join('\n') + '\n';
  }

  const head = pick(/<head>[\s\S]*<\/head>/, '<head>')
    .replace(/[ \t]*<link rel="stylesheet" href="css\/[^"]+">/, style);
  return '<!DOCTYPE html>\n<html lang="de">\n' + head + '\n<body>\n' + body + '\n' + script + '\n</body>\n</html>\n';
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--fragment');
  const fragment = i >= 0;
  const out = fragment ? args[i + 1] : path.join(__dirname, '..', 'dist', game.out);
  if (!out) {
    console.error('Bitte eine Zieldatei angeben:  node tools/build.js --fragment <Datei>');
    process.exit(2);
  }
  const result = build(fragment);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, result);
  console.log(path.relative(process.cwd(), path.resolve(out)) + ' geschrieben (' + (result.length / 1024).toFixed(1) + ' kB)');
}

main();
