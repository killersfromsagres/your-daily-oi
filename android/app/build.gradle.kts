plugins { id("com.android.application") }

android {
  namespace = "com.zangflix.app"
  compileSdk = 35
  defaultConfig {
    applicationId = "com.zangflix.app"
    minSdk = 26
    targetSdk = 35
    versionCode = 5
    versionName = "2.0.0"
  }
  flavorDimensions += "formFactor"
  productFlavors {
    create("mobile") {
      dimension = "formFactor"
      applicationId = "com.zangflix.app"
      buildConfigField("boolean", "TV_EDITION", "false")
    }
    create("television") {
      dimension = "formFactor"
      applicationId = "com.zangflix.tv"
      buildConfigField("boolean", "TV_EDITION", "true")
    }
  }
  buildFeatures { buildConfig = true }
  buildTypes { getByName("release") { isMinifyEnabled = false } }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}
