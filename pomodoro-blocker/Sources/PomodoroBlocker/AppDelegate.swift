import AppKit
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var config = BlockerConfig.load()
    private lazy var pomodoro = PomodoroTimer(config: config)
    private let blockManager = BlockManager()

    private var menu: NSMenu!
    private var statusLabelItem: NSMenuItem!
    private var startFocusItem: NSMenuItem!
    private var skipItem: NSMenuItem!
    private var stopItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        // Only request notification authorization when running as a real bundled
        // app (see Scripts/build-app.sh) — bare `swift run` binaries have no
        // bundle identifier and UNUserNotificationCenter will just no-op safely.
        if Bundle.main.bundleIdentifier != nil {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.title = "🍅"
        buildMenu()

        pomodoro.onTick = { [weak self] remaining in
            self?.updateStatusTitle(remaining: remaining)
        }
        pomodoro.onPhaseChange = { [weak self] phase in
            self?.handlePhaseChange(phase)
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleBlockedLaunch(_:)),
            name: .pomodoroBlockedLaunch,
            object: nil
        )

        signal(SIGINT) { _ in AppDelegate.emergencyRestore() }
        signal(SIGTERM) { _ in AppDelegate.emergencyRestore() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        blockManager.stopBlocking()
    }

    /// Best-effort hosts-file cleanup if the process is killed unexpectedly
    /// mid-session, so a crash never leaves sites permanently blocked.
    private static func emergencyRestore() {
        HostsFileBlocker().stop()
        exit(0)
    }

    private func buildMenu() {
        menu = NSMenu()

        statusLabelItem = NSMenuItem(title: "Ready to focus", action: nil, keyEquivalent: "")
        statusLabelItem.isEnabled = false
        menu.addItem(statusLabelItem)
        menu.addItem(.separator())

        startFocusItem = NSMenuItem(title: "Start Focus Session", action: #selector(startFocus), keyEquivalent: "s")
        startFocusItem.target = self
        menu.addItem(startFocusItem)

        skipItem = NSMenuItem(title: "Skip to Next Phase", action: #selector(skipPhase), keyEquivalent: "k")
        skipItem.target = self
        skipItem.isHidden = true
        menu.addItem(skipItem)

        stopItem = NSMenuItem(title: "Stop", action: #selector(stopSession), keyEquivalent: ".")
        stopItem.target = self
        stopItem.isHidden = true
        menu.addItem(stopItem)

        menu.addItem(.separator())

        let editConfigItem = NSMenuItem(title: "Edit Block List…", action: #selector(revealConfig), keyEquivalent: "")
        editConfigItem.target = self
        menu.addItem(editConfigItem)

        let reloadConfigItem = NSMenuItem(title: "Reload Block List", action: #selector(reloadConfig), keyEquivalent: "")
        reloadConfigItem.target = self
        menu.addItem(reloadConfigItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    @objc private func startFocus() {
        pomodoro.startFocus()
    }

    @objc private func skipPhase() {
        pomodoro.skip()
    }

    @objc private func stopSession() {
        pomodoro.stop()
    }

    @objc private func revealConfig() {
        NSWorkspace.shared.activateFileViewerSelecting([BlockerConfig.configURL])
    }

    @objc private func reloadConfig() {
        config = BlockerConfig.load()
        pomodoro.updateConfig(config)
        notify(title: "Pomodoro Blocker", body: "Block list reloaded.")
    }

    @objc private func quit() {
        blockManager.stopBlocking()
        NSApp.terminate(nil)
    }

    private func handlePhaseChange(_ phase: PomodoroPhase) {
        switch phase {
        case .idle:
            blockManager.stopBlocking()
            statusLabelItem.title = "Ready to focus"
            startFocusItem.isHidden = false
            skipItem.isHidden = true
            stopItem.isHidden = true
            statusItem.button?.title = "🍅"

        case .focus:
            config = BlockerConfig.load()
            blockManager.startBlocking(config: config)
            statusLabelItem.title = "Focusing — distractions blocked"
            startFocusItem.isHidden = true
            skipItem.isHidden = false
            stopItem.isHidden = false
            notify(title: "Focus session started", body: "Messaging & social apps are blocked for \(config.focusMinutes) min.")

        case .shortBreak, .longBreak:
            blockManager.stopBlocking()
            statusLabelItem.title = "On a break"
            notify(title: "Break time", body: "Blocked apps & sites are unblocked. Back to it soon!")
        }
    }

    private func updateStatusTitle(remaining: Int) {
        let minutes = remaining / 60
        let seconds = remaining % 60
        let emoji = pomodoro.phase == .focus ? "🍅" : "☕️"
        statusItem.button?.title = String(format: "%@ %02d:%02d", emoji, minutes, seconds)
    }

    @objc private func handleBlockedLaunch(_ note: Notification) {
        let appName = note.userInfo?["appName"] as? String ?? "An app"
        notify(title: "Blocked", body: "\(appName) was closed — stay focused!")
    }

    private func notify(title: String, body: String) {
        guard Bundle.main.bundleIdentifier != nil else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
