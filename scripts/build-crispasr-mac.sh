#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
source_dir="$project_dir/.tools/crispasr-macos14/upstream"
build_dir="$project_dir/.tools/crispasr-macos14/build-release"
cmake_bin=${INKCLING_CMAKE:-"$project_dir/.tools/build-python/cmake/data/bin/cmake"}
if [ ! -x "$cmake_bin" ]; then
  echo 'Install CMake 3.31.6 locally, or set INKCLING_CMAKE to its executable.' >&2
  exit 1
fi
if [ ! -d "$source_dir/.git" ]; then
  git clone --depth 1 --branch v0.8.23 --recurse-submodules --shallow-submodules https://github.com/CrispStrobe/CrispASR.git "$source_dir"
fi
[ "$(git -C "$source_dir" rev-parse HEAD)" = '7d22deeca045f9c80020bf59e6a24564b1d66e5b' ]
"$cmake_bin" -S "$source_dir" -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 \
  -DCMAKE_OSX_ARCHITECTURES=arm64 -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_NATIVE=OFF \
  -DGGML_OPENMP=OFF -DCRISPASR_BUILD_TESTS=OFF -DCRISPASR_C2PA_FETCH=OFF
"$cmake_bin" --build "$build_dir" --config Release --target crispasr-cli --parallel 4
cp "$build_dir/bin/crispasr" resources/bin/crispasr/crispasr.next
mv resources/bin/crispasr/crispasr.next resources/bin/crispasr/crispasr
node scripts/audit-macos-runtime.mjs resources/bin/crispasr
