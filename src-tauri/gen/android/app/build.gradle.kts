import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

fun tauriPropOrEnv(propKey: String, envKey: String): String? {
    return tauriProperties.getProperty(propKey)?.takeIf { it.isNotBlank() }
        ?: System.getenv(envKey)?.takeIf { it.isNotBlank() }
}

fun isReleaseTaskRequested(): Boolean {
    return gradle.startParameter.taskNames.any {
        it.contains("Release", ignoreCase = true) || it.contains("Bundle", ignoreCase = true)
    }
}

android {
    compileSdk = 36
    namespace = "com.furu_app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.furu_app"
        minSdk = 26
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            val storeFilePath = tauriPropOrEnv("tauri.android.signing.storeFile", "ANDROID_KEYSTORE_PATH")
            val storePasswordValue = tauriPropOrEnv("tauri.android.signing.storePassword", "ANDROID_KEYSTORE_PASSWORD")
            val keyAliasValue = tauriPropOrEnv("tauri.android.signing.keyAlias", "ANDROID_KEY_ALIAS")
            val keyPasswordValue = tauriPropOrEnv("tauri.android.signing.keyPassword", "ANDROID_KEY_PASSWORD")

            if (
                isReleaseTaskRequested() &&
                    (storeFilePath == null ||
                        storePasswordValue == null ||
                        keyAliasValue == null ||
                        keyPasswordValue == null)
            ) {
                throw GradleException(
                    "Missing Android release signing config. Set tauri.android.signing.* in app/tauri.properties " +
                        "or env vars ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.",
                )
            }

            if (storeFilePath != null && storePasswordValue != null && keyAliasValue != null && keyPasswordValue != null) {
                storeFile = file(storeFilePath)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "Furu Dev")
            resValue("string", "main_activity_title", "Furu Dev")
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")