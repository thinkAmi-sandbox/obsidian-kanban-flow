// Sync the version into manifest.json from package.json (the single source of truth).
//
// Run automatically by the npm `version` lifecycle hook (see package.json "scripts.version"),
// i.e. as part of `npm version patch|minor|major`. You should not need to run it by hand.
//
// Intentionally does NOT touch versions.json: this plugin keeps minAppVersion fixed, so the
// single floor entry in versions.json never needs per-release updates. If strict minAppVersion
// management is ever needed, add the {version: minAppVersion} append here.
import { readFileSync, writeFileSync } from 'fs';

const targetVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = targetVersion;
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`version-bump: manifest.json -> ${targetVersion}`);
