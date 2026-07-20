import Foundation

/// Coordinates the app blocker and hosts-file blocker together for one focus session.
final class BlockManager {
    private let appBlocker = AppBlocker()
    private let hostsBlocker = HostsFileBlocker()

    func startBlocking(config: BlockerConfig) {
        appBlocker.start(blockedBundleIDs: config.blockedBundleIDs)
        hostsBlocker.start(domains: config.blockedDomains)
    }

    func stopBlocking() {
        appBlocker.stop()
        hostsBlocker.stop()
    }
}
