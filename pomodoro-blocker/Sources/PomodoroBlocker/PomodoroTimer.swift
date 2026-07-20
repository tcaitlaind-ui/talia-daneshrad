import Foundation

enum PomodoroPhase {
    case idle
    case focus
    case shortBreak
    case longBreak
}

final class PomodoroTimer {
    private(set) var phase: PomodoroPhase = .idle
    private(set) var remainingSeconds: Int = 0
    private(set) var completedFocusSessions: Int = 0

    private var timer: Timer?
    private var config: BlockerConfig

    var onTick: ((Int) -> Void)?
    var onPhaseChange: ((PomodoroPhase) -> Void)?

    init(config: BlockerConfig) {
        self.config = config
    }

    func updateConfig(_ config: BlockerConfig) {
        self.config = config
    }

    func startFocus() {
        completedFocusSessions = 0
        beginPhase(.focus)
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        phase = .idle
        remainingSeconds = 0
        onPhaseChange?(.idle)
    }

    func skip() {
        advance()
    }

    private func beginPhase(_ newPhase: PomodoroPhase) {
        phase = newPhase
        switch newPhase {
        case .idle:
            remainingSeconds = 0
        case .focus:
            remainingSeconds = config.focusMinutes * 60
        case .shortBreak:
            remainingSeconds = config.shortBreakMinutes * 60
        case .longBreak:
            remainingSeconds = config.longBreakMinutes * 60
        }

        onPhaseChange?(newPhase)

        timer?.invalidate()
        let newTimer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
        // Add in .common mode so it keeps ticking while the status bar menu is open.
        RunLoop.main.add(newTimer, forMode: .common)
        timer = newTimer
    }

    private func tick() {
        guard remainingSeconds > 0 else {
            advance()
            return
        }
        remainingSeconds -= 1
        onTick?(remainingSeconds)
    }

    private func advance() {
        switch phase {
        case .focus:
            completedFocusSessions += 1
            if completedFocusSessions % config.sessionsUntilLongBreak == 0 {
                beginPhase(.longBreak)
            } else {
                beginPhase(.shortBreak)
            }
        case .shortBreak, .longBreak:
            beginPhase(.focus)
        case .idle:
            break
        }
    }
}
