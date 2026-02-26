use serde::{Deserialize, Serialize};
use std::fmt;

/// Possible states an agent can be in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentState {
    Idle,
    Running,
    Paused,
    Error,
    Stopped,
}

impl fmt::Display for AgentState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            AgentState::Idle => "idle",
            AgentState::Running => "running",
            AgentState::Paused => "paused",
            AgentState::Error => "error",
            AgentState::Stopped => "stopped",
        };
        write!(f, "{}", s)
    }
}

impl AgentState {
    /// Parse a state from its string representation (as stored in the DB).
    pub fn from_str_label(s: &str) -> Option<AgentState> {
        match s {
            "idle" => Some(AgentState::Idle),
            "running" => Some(AgentState::Running),
            "paused" => Some(AgentState::Paused),
            "error" => Some(AgentState::Error),
            "stopped" => Some(AgentState::Stopped),
            _ => None,
        }
    }
}

/// Check whether a transition from one state to another is valid.
///
/// Valid transitions:
///   Idle    -> Running
///   Running -> Paused, Stopped, Error
///   Paused  -> Running, Stopped
///   Error   -> Idle
///   Stopped -> Idle
pub fn can_transition(from: AgentState, to: AgentState) -> bool {
    matches!(
        (from, to),
        (AgentState::Idle, AgentState::Running)
            | (AgentState::Running, AgentState::Paused)
            | (AgentState::Running, AgentState::Stopped)
            | (AgentState::Running, AgentState::Error)
            | (AgentState::Paused, AgentState::Running)
            | (AgentState::Paused, AgentState::Stopped)
            | (AgentState::Error, AgentState::Idle)
            | (AgentState::Stopped, AgentState::Idle)
    )
}

/// Tracks the lifecycle state of a single agent and enforces valid transitions.
pub struct AgentLifecycle {
    current: AgentState,
}

impl AgentLifecycle {
    /// Create a new lifecycle tracker starting in the given state.
    pub fn new(initial: AgentState) -> Self {
        Self { current: initial }
    }

    /// Create a lifecycle tracker from a DB status string.
    /// Defaults to `Idle` if the string is unrecognized.
    pub fn from_status(status: &str) -> Self {
        let state = AgentState::from_str_label(status).unwrap_or(AgentState::Idle);
        Self::new(state)
    }

    /// Return the current state.
    pub fn current(&self) -> AgentState {
        self.current
    }

    /// Attempt to transition to a new state.
    /// Returns `Ok(())` if the transition is valid, or `Err` with a descriptive message.
    pub fn transition_to(&mut self, next: AgentState) -> Result<(), String> {
        if can_transition(self.current, next) {
            self.current = next;
            Ok(())
        } else {
            Err(format!(
                "Invalid state transition: {} -> {}",
                self.current, next
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_transitions() {
        assert!(can_transition(AgentState::Idle, AgentState::Running));
        assert!(can_transition(AgentState::Running, AgentState::Paused));
        assert!(can_transition(AgentState::Running, AgentState::Stopped));
        assert!(can_transition(AgentState::Running, AgentState::Error));
        assert!(can_transition(AgentState::Paused, AgentState::Running));
        assert!(can_transition(AgentState::Paused, AgentState::Stopped));
        assert!(can_transition(AgentState::Error, AgentState::Idle));
        assert!(can_transition(AgentState::Stopped, AgentState::Idle));
    }

    #[test]
    fn test_invalid_transitions() {
        assert!(!can_transition(AgentState::Idle, AgentState::Paused));
        assert!(!can_transition(AgentState::Idle, AgentState::Stopped));
        assert!(!can_transition(AgentState::Idle, AgentState::Error));
        assert!(!can_transition(AgentState::Running, AgentState::Idle));
        assert!(!can_transition(AgentState::Paused, AgentState::Error));
        assert!(!can_transition(AgentState::Error, AgentState::Running));
        assert!(!can_transition(AgentState::Stopped, AgentState::Running));
    }

    #[test]
    fn test_lifecycle_transitions() {
        let mut lc = AgentLifecycle::new(AgentState::Idle);
        assert_eq!(lc.current(), AgentState::Idle);

        assert!(lc.transition_to(AgentState::Running).is_ok());
        assert_eq!(lc.current(), AgentState::Running);

        assert!(lc.transition_to(AgentState::Paused).is_ok());
        assert_eq!(lc.current(), AgentState::Paused);

        assert!(lc.transition_to(AgentState::Running).is_ok());
        assert_eq!(lc.current(), AgentState::Running);

        assert!(lc.transition_to(AgentState::Stopped).is_ok());
        assert_eq!(lc.current(), AgentState::Stopped);

        assert!(lc.transition_to(AgentState::Idle).is_ok());
        assert_eq!(lc.current(), AgentState::Idle);
    }

    #[test]
    fn test_lifecycle_invalid_transition_error() {
        let mut lc = AgentLifecycle::new(AgentState::Idle);
        let result = lc.transition_to(AgentState::Stopped);
        assert!(result.is_err());
        assert_eq!(lc.current(), AgentState::Idle); // state unchanged
    }

    #[test]
    fn test_from_status_string() {
        let lc = AgentLifecycle::from_status("running");
        assert_eq!(lc.current(), AgentState::Running);

        let lc = AgentLifecycle::from_status("garbage");
        assert_eq!(lc.current(), AgentState::Idle);
    }

    #[test]
    fn test_agent_state_display() {
        assert_eq!(AgentState::Idle.to_string(), "idle");
        assert_eq!(AgentState::Running.to_string(), "running");
        assert_eq!(AgentState::Error.to_string(), "error");
    }
}
