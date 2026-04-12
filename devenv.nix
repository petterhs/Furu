{
  pkgs,
  lib,
  config,
  ...
}:
let
  # Runtime `.so` search path (same idea as `mkShell` + `buildInputs` in your flake).
  tauriLibs = with pkgs; [
    gtk3
    libsoup_3
    webkitgtk_4_1
    cairo
    gdk-pixbuf
    glib
    dbus
    librsvg
    zlib
    curl
    pango
    harfbuzz
    atk
    at-spi2-atk
    systemd
  ];

  # For `pkg-config` when building Tauri / webkit2gtk-style crates.
  tauriPkgConfig = with pkgs; [
    openssl.dev
    dbus.dev
    glib.dev
    libsoup_3.dev
    webkitgtk_4_1.dev
    gtk3.dev
    gdk-pixbuf.dev
    cairo.dev
    pango.dev
    harfbuzz.dev
    atk.dev
    librsvg.dev
    zlib.dev
  ];
in
{
  android = {
    enable = true;
    # Keep in sync with `src-tauri/gen/android/app/build.gradle.kts` (compileSdk / targetSdk).
    # AGP 8.11 + API 36 expects build-tools 35; first entry is used for devenv’s aapt2 GRADLE_OPTS.
    platforms.version = [ "36" ];
    buildTools.version = [ "35.0.0" "34.0.0" ];
    emulator.enable = false;
    ndk.enable = true;
  };

  languages = {
    rust = {
      enable = true;
      channel = "stable";
      targets = [
        "aarch64-linux-android"
        "armv7-linux-androideabi"
        "i686-linux-android"
        "x86_64-linux-android"
      ];
    };
    javascript = {
      enable = true;
      pnpm = {
        enable = true;
        install.enable = true;
      };
    };
    typescript.enable = true;
  };

  packages =
    with pkgs;
    [
      pkg-config
      cargo-tauri
      gobject-introspection
    ]
    ++ tauriLibs;

  env =
    {
      PKG_CONFIG_PATH = lib.makeSearchPath "lib/pkgconfig" tauriPkgConfig;
      LD_LIBRARY_PATH = "${lib.makeLibraryPath tauriLibs}:$LD_LIBRARY_PATH";
      # Wayland / GTK: correct scale & GSettings (see NixOS wiki Tauri page).
      XDG_DATA_DIRS = "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS";
    }
    // lib.optionalAttrs config.android.enable {
      # Common aliases; devenv sets ANDROID_HOME and ANDROID_NDK_ROOT.
      ANDROID_SDK_ROOT = config.env.ANDROID_HOME;
      NDK_HOME = config.env.ANDROID_NDK_ROOT;
    };

  # See full reference at https://devenv.sh/reference/options/
}
