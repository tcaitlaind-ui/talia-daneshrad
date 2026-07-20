import Foundation

struct BlockerConfig: Codable {
    var focusMinutes: Int
    var shortBreakMinutes: Int
    var longBreakMinutes: Int
    var sessionsUntilLongBreak: Int
    var blockedBundleIDs: [String]
    var blockedDomains: [String]

    static let `default` = BlockerConfig(
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsUntilLongBreak: 4,
        blockedBundleIDs: [
            "com.apple.iChat",           // Messages.app
            "com.tinyspeck.slackmacgap", // Slack
            "com.hnc.Discord",           // Discord
            "net.whatsapp.WhatsApp",     // WhatsApp
            "ru.keepcoder.Telegram"      // Telegram
            // Verify these against apps you actually have installed:
            //   osascript -e 'id of app "App Name"'
            // then add/remove entries as needed.
        ],
        blockedDomains: [
            "instagram.com", "www.instagram.com",
            "x.com", "www.x.com", "twitter.com", "www.twitter.com",
            "facebook.com", "www.facebook.com", "messenger.com",
            "tiktok.com", "www.tiktok.com",
            "reddit.com", "www.reddit.com",
            "snapchat.com", "www.snapchat.com",
            "web.whatsapp.com",
            "discord.com",
            "messages.google.com"
        ]
    )

    static var configURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PomodoroBlocker", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("config.json")
    }

    static func load() -> BlockerConfig {
        guard let data = try? Data(contentsOf: configURL),
              let config = try? JSONDecoder().decode(BlockerConfig.self, from: data) else {
            let def = BlockerConfig.default
            def.save()
            return def
        }
        return config
    }

    func save() {
        guard let data = try? JSONEncoder.pretty.encode(self) else { return }
        try? data.write(to: BlockerConfig.configURL)
    }
}

private extension JSONEncoder {
    static var pretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
