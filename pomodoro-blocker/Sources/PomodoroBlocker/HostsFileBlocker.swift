import Foundation

/// Blocks websites by null-routing their domains in /etc/hosts for the
/// duration of a focus session. Requires an admin password prompt each time
/// it edits the file (macOS's native authorization dialog via AppleScript).
final class HostsFileBlocker {
    private static let startMarker = "# >>> PomodoroBlocker managed block >>>"
    private static let endMarker = "# <<< PomodoroBlocker managed block <<<"
    private static let hostsPath = "/etc/hosts"

    private(set) var isActive = false

    @discardableResult
    func start(domains: [String]) -> Bool {
        guard !domains.isEmpty else { return true }
        let entries = domains.map { "0.0.0.0 \($0)" }.joined(separator: "\n")
        let block = "\(Self.startMarker)\n\(entries)\n\(Self.endMarker)"

        let ok = applyToHosts { current in
            stripManagedBlock(from: current) + "\n" + block + "\n"
        }
        if ok {
            isActive = true
        }
        return ok
    }

    @discardableResult
    func stop() -> Bool {
        guard isActive else { return true }
        let ok = applyToHosts { current in
            stripManagedBlock(from: current)
        }
        if ok {
            isActive = false
        }
        return ok
    }

    private func stripManagedBlock(from contents: String) -> String {
        guard let startRange = contents.range(of: Self.startMarker),
              let endRange = contents.range(of: Self.endMarker),
              startRange.lowerBound < endRange.upperBound else {
            return contents
        }
        var result = contents
        result.removeSubrange(startRange.lowerBound..<endRange.upperBound)
        return result.trimmingCharacters(in: .whitespacesAndNewlines) + "\n"
    }

    /// Writes the transformed hosts file via a single privileged shell command,
    /// prompting the user for their admin password through the system dialog.
    private func applyToHosts(_ transform: (String) -> String) -> Bool {
        guard let currentData = try? Data(contentsOf: URL(fileURLWithPath: Self.hostsPath)),
              let current = String(data: currentData, encoding: .utf8) else {
            return false
        }
        let updated = transform(current)

        let tempURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("hosts-pomodoro-\(UUID().uuidString)")
        guard (try? updated.write(to: tempURL, atomically: true, encoding: .utf8)) != nil else {
            return false
        }
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let shellCommand = "cp \(Self.hostsPath) \(Self.hostsPath).pomodoro-bak; " +
            "cp '\(tempURL.path)' \(Self.hostsPath); " +
            "dscacheutil -flushcache; killall -HUP mDNSResponder"
        let script = "do shell script \"\(shellCommand)\" with administrator privileges"

        var error: NSDictionary?
        NSAppleScript(source: script)?.executeAndReturnError(&error)
        return error == nil
    }
}
