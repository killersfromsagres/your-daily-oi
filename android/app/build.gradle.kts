plugins { id("com.android.application") }
android { namespace = "com.zangflix.app"; compileSdk = 35
 defaultConfig { applicationId = "com.zangflix.app"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "1.0.1" }
 buildTypes { getByName("release") { isMinifyEnabled = false } }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
