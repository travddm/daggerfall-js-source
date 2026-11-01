#!/bin/sh
# Fetches the vendored mods' files that their authors publish on GitHub into vendor/<folder>/.
# Each repository is downloaded at a pinned commit, so a fetch always gives the same bytes.
# Only the files the game and the tests read are copied. Each folder's README.md, and every file
# that differs from the published repository or is missing from it, stay tracked in git.
#
# Usage: sh tools/fetch-vendor.sh [--list] [--dest <vendor-dir>] [folder ...]
#   --list   print "<folder> <owner/repo> <commit>" for each folder and fetch nothing
#   --dest   the vendor directory to fill (default: vendor/ beside this script's tools/)
#   folder   fetch only these folders (default: all)
# A folder whose marker file holds the pinned commit is skipped, so a second run needs no network.
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST="$ROOT/vendor"
MARKER=.fetched-vendor
ALL="better-ambience immersive-footsteps meanerMonsters unleveledLoot"

# The pinned source of each folder: "<owner/repo> <commit>".
source_of() {
  case "$1" in
    better-ambience) echo "joshcamas/daggerfall-unity-mods c59e2aa9085734df3aefd19b5dd8c0b49cfcaade" ;;
    immersive-footsteps) echo "magicono43/DFU-Mod_Immersive-Footsteps ac03581ca5b336eac0802af654b35c90af534290" ;;
    meanerMonsters) echo "Ralzar81/Meaner-Monsters 4ebf302cc4e806f107faef441eb8894b26adf906" ;;
    unleveledLoot) echo "Ralzar81/Unleveled-Loot 3b5b2127fb3837aaf85c4cd2d339bfa5399fa031" ;;
    *) return 1 ;;
  esac
}

usage() {
  sed -n '7,11p' "$0" | sed 's/^# \{0,1\}//'
}

put() {
  mkdir -p "$(dirname "$2")"
  cp "$1" "$2"
}

# The repository holds Better Ambience 0.1.3. Its clips are the bytes the 0.1.4 bundle carries,
# so only the 29 clips the port plays are fetched. The 0.1.4 scripts, manifest and settings
# differ from the repository and stay tracked.
place_better_ambience() {
  for name in AmbientRaining \
    sfx_footstep_armor_light_000 sfx_footstep_armor_light_001 sfx_footstep_armor_light_002 \
    sfx_footstep_armor_light_003 sfx_footstep_armor_light_004 sfx_footstep_armor_light_005 \
    sfx_footstep_armor_light_006 sfx_footstep_armor_light_007 sfx_footstep_armor_light_008 \
    sfx_footstep_armor_light_009 sfx_footstep_armor_light_010 \
    sfx_footstep_crunchy-grass_000 sfx_footstep_crunchy-grass_001 sfx_footstep_crunchy-grass_002 \
    sfx_footstep_crunchy-grass_003 \
    sfx_footstep_stone_000 sfx_footstep_stone_001 sfx_footstep_stone_002 sfx_footstep_stone_003 \
    sfx_footstep_water_000 sfx_footstep_water_002 sfx_footstep_water_003 sfx_footstep_water_004 \
    sfx_footstep_water_005 \
    sfx_footstep_wood_000 sfx_footstep_wood_001 sfx_footstep_wood_002 sfx_footstep_wood_003; do
    put "$1/BetterAmbience/Sound/$name.wav" "$2/Sound/$name.wav"
  done
}

# The repository is the mod's own folder. Unity's .meta files and the repository's README are
# not part of the bundle, and the test that walks Audio/ refuses any file the manifest does not name.
place_immersive_footsteps() {
  (cd "$1" && find Audio -type f -name '*.mp3') | while IFS= read -r clip; do
    put "$1/$clip" "$2/$clip"
  done
  count=$(find "$2/Audio" -type f -name '*.mp3' | wc -l)
  if [ "$count" -ne 210 ]; then
    echo "immersive-footsteps: expected 210 clips, found $count" >&2
    return 1
  fi
  put "$1/Scripts/ImmersiveFootstepsMain.cs" "$2/Scripts/ImmersiveFootstepsMain.cs"
  put "$1/Scripts/ImmersiveFootstepsObject.cs" "$2/Scripts/ImmersiveFootstepsObject.cs"
  put "$1/modsettings.json" "$2/modsettings.json"
  # The bundle names its manifest after the mod folder; the repository names it after the mod title.
  put "$1/ImmersiveFootsteps.dfmod.json" "$2/immersive-footsteps.dfmod.json"
}

# The repository has no xml/ sprite records, so they stay tracked.
place_meaner_monsters() {
  put "$1/MeanerMonsters.dfmod.json" "$2/MeanerMonsters.dfmod.json"
}

# The repository's manifest is 1.1.1 and the port follows 1.1.2, so the manifest stays tracked.
place_unleveled_loot() {
  put "$1/Unleveled Loot/modsettings.json" "$2/modsettings.json"
}

fetch_one() {
  folder=$1
  set -- $(source_of "$folder")
  repo=$1
  commit=$2
  target="$DEST/$folder"
  if [ -f "$target/$MARKER" ] && [ "$(cat "$target/$MARKER")" = "$commit" ]; then
    echo "$folder: already at $commit"
    return 0
  fi
  echo "$folder: fetching $repo at $commit"
  tmp=$(mktemp -d)
  mkdir "$tmp/src"
  if ! curl -sfL "https://codeload.github.com/$repo/tar.gz/$commit" -o "$tmp/src.tar.gz"; then
    rm -rf "$tmp"
    echo "$folder: download failed" >&2
    return 1
  fi
  tar -xzf "$tmp/src.tar.gz" -C "$tmp/src"
  # The archive holds one top folder, named <repo>-<commit>.
  set -- "$tmp"/src/*
  src=$1
  mkdir -p "$target"
  case "$folder" in
    better-ambience) place_better_ambience "$src" "$target" ;;
    immersive-footsteps) place_immersive_footsteps "$src" "$target" ;;
    meanerMonsters) place_meaner_monsters "$src" "$target" ;;
    unleveledLoot) place_unleveled_loot "$src" "$target" ;;
  esac
  rm -rf "$tmp"
  echo "$commit" > "$target/$MARKER"
}

LIST=0
NAMES=
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1 ;;
    --dest)
      if [ -z "$2" ]; then
        echo "--dest needs a directory" >&2
        exit 2
      fi
      DEST=$2
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "unknown option: $1" >&2
      exit 2
      ;;
    *) NAMES="$NAMES $1" ;;
  esac
  shift
done
[ -n "$NAMES" ] || NAMES=$ALL

# Every name is checked before anything is downloaded.
for name in $NAMES; do
  if ! source_of "$name" > /dev/null; then
    echo "unknown vendor folder: $name (known: $ALL)" >&2
    exit 1
  fi
done

for name in $NAMES; do
  if [ "$LIST" -eq 1 ]; then
    echo "$name $(source_of "$name")"
  else
    fetch_one "$name"
  fi
done
