// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PomodoroBlocker",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "PomodoroBlocker",
            path: "Sources/PomodoroBlocker"
        )
    ]
)
