fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if target.contains("android") {
        // ELF PT_LOAD alignment for 16 KB page devices. Tauri’s Android cargo
        // invocation can miss `.cargo/config.toml`; these apply to this crate only.
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }
    tauri_build::build();
}
