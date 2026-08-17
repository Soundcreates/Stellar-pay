allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Reown's Coinbase connector still declares compileSdk 31. Its AndroidX
// dependencies require a modern compile SDK, so inherit the app's API level.
gradle.afterProject {
    if (name == "coinbase_wallet_sdk") {
        extensions.configure<com.android.build.api.dsl.LibraryExtension> {
            compileSdk = 36
            defaultConfig.consumerProguardFiles.clear()
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
