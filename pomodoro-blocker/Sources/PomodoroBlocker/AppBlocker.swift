import AppKit

extension Notification.Name {
    static let pomodoroBlockedLaunch = Notification.Name("PomodoroBlockedLaunch")
}

/// Terminates blocked apps (by bundle identifier) when a focus session starts,
/// and re-terminates them immediately if the user tries to relaunch one mid-session.
final class AppBlocker {
    private var blockedBundleIDs: Set<String> = []
    private var launchObserver: NSObjectProtocol?
    private(set) var isActive = false

    func start(blockedBundleIDs: [String]) {
        self.blockedBundleIDs = Set(blockedBundleIDs)
        isActive = true

        terminateRunningBlockedApps()

        let center = NSWorkspace.shared.notificationCenter
        launchObserver = center.addObserver(
            forName: NSWorkspace.didLaunchApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            self?.handleLaunch(note)
        }
    }

    func stop() {
        isActive = false
        if let launchObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(launchObserver)
        }
        launchObserver = nil
        blockedBundleIDs = []
    }

    private func terminateRunningBlockedApps() {
        for app in NSWorkspace.shared.runningApplications {
            if let id = app.bundleIdentifier, blockedBundleIDs.contains(id) {
                app.terminate()
            }
        }
    }

    private func handleLaunch(_ note: Notification) {
        guard isActive,
              let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let id = app.bundleIdentifier,
              blockedBundleIDs.contains(id)
        else { return }

        app.terminate()
        NotificationCenter.default.post(
            name: .pomodoroBlockedLaunch,
            object: nil,
            userInfo: ["appName": app.localizedName ?? id]
        )
    }
}
