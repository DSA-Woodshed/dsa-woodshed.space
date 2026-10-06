{
  description = "dsa-woodshed.space development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        corePackages = with pkgs; [
          # Core JS toolchain
          nodejs_22
          pnpm
          typescript
          typescript-language-server

          # Build / VCS / CLI
          just
          git
          gh
          bazelisk
          gitleaks
          syft

          # Content export and public workflow checks
          python3
          jq
        ];
        playwrightRuntimeLibraries = with pkgs; [
          alsa-lib
          at-spi2-atk
          at-spi2-core
          atk
          cairo
          cups
          dbus
          expat
          fontconfig
          freetype
          glib
          gtk3
          libdrm
          libgbm
          libxkbcommon
          mesa
          nspr
          nss
          pango
          libx11
          libxscrnsaver
          libxcomposite
          libxcursor
          libxdamage
          libxext
          libxfixes
          libxi
          libxrandr
          libxrender
          libxtst
        ];
        shellHook =
          extraHook:
          ''
            # Prefer the pinned shell's real launcher over machine-local wrappers.
            export PATH="${pkgs.bazelisk}/bin:$PATH"
            export USE_BAZEL_VERSION="$(cat .bazelversion)"

            # Honor packageManager's exact pnpm pin.
            corepack enable >/dev/null 2>&1 || true

            ${extraHook}

            echo "dsa-woodshed.space dev shell"
            echo "  node     $(node --version)"
            echo "  pnpm     $(pnpm --version 2>/dev/null || echo 'not available yet')"
            echo "  just     $(just --version)"
            echo "  bazel    $(bazelisk --version 2>&1 | head -n1)"
            echo "  gh       $(gh --version | head -n1)"
            echo "  gitleaks $(gitleaks version 2>&1 | head -n1)"
            echo "  python   $(python3 --version)"
            echo "  jq       $(jq --version)"
          '';
        # Use the same browser and fallback font metrics locally and in CI.
        playwrightFonts = with pkgs; [
          dejavu_fonts
          liberation_ttf
        ];
        playwrightFontsConf = pkgs.makeFontsConf {
          fontDirectories = playwrightFonts;
          impureFontDirectories = [ ];
        };
        playwrightShellHook = pkgs.lib.optionalString pkgs.stdenv.isLinux ''
          export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${pkgs.chromium}/bin/chromium"
          export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath playwrightRuntimeLibraries}:''${LD_LIBRARY_PATH:-}"
          export FONTCONFIG_FILE="${playwrightFontsConf}"
        '';
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = corePackages;
          shellHook = shellHook "";
        };

        devShells.playwright = pkgs.mkShell {
          buildInputs =
            corePackages
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux ([ pkgs.chromium ] ++ playwrightRuntimeLibraries ++ playwrightFonts);
          shellHook = shellHook playwrightShellHook;
        };

        formatter = pkgs.nixpkgs-fmt;
      }
    );
}
