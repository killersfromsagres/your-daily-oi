plugins { id("com.android.application") }

android {
  namespace = "com.zangflix.app"
  compileSdk = 35
  defaultConfig {
    applicationId = "com.zangflix.app"
    minSdk = 26
    targetSdk = 35
    versionCode = 6
    versionName = "2.1.0"
  }
  flavorDimensions += "formFactor"
  productFlavors {
    create("mobile") {
      dimension = "formFactor"
      applicationId = "com.zangflix.app"
      buildConfigField("boolean", "TV_EDITION", "false")
      manifestPlaceholders["appLabel"] = "ZANG FLIX"
    }
    create("television") {
      dimension = "formFactor"
      applicationId = "com.zangflix.tv"
      buildConfigField("boolean", "TV_EDITION", "true")
      manifestPlaceholders["appLabel"] = "ZANG FLIX TV"
      versionCode = 10
      versionName = "2.5.0"
    }
  }
  buildFeatures { buildConfig = true }
  buildTypes { getByName("release") { isMinifyEnabled = false } }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}
