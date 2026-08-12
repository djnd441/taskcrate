use crate::error::AppError;
use crate::models::{Task, TaskStatus};

pub fn can_transition(from: TaskStatus, to: TaskStatus) -> bool {
    if from == to {
        return true;
    }
    use TaskStatus::*;
    matches!(
        (from, to),
        (Todo, InProgress)
            | (Todo, Completed)
            | (Todo, Cancelled)
            | (InProgress, Todo)
            | (InProgress, Completed)
            | (InProgress, Cancelled)
            | (Completed, Todo)
            | (Cancelled, Todo)
    )
}

pub fn apply_status_transition(
    task: &mut Task,
    next: TaskStatus,
    now: &str,
) -> Result<(), AppError> {
    if !can_transition(task.status, next) {
        return Err(AppError::InvalidTransition(format!(
            "{} -> {}",
            task.status.as_str(),
            next.as_str()
        )));
    }
    task.status = next;
    task.completed_at = if next == TaskStatus::Completed {
        Some(now.to_string())
    } else {
        None
    };
    task.updated_at = now.to_string();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Priority, RepeatFrequency, TaskKind};

    fn task(status: TaskStatus) -> Task {
        Task {
            id: "t1".into(),
            title: "测试".into(),
            notes: String::new(),
            due_at: None,
            repeat_frequency: RepeatFrequency::None,
            repeat_interval: 1,
            repeat_end_at: None,
            assignee: None,
            department: None,
            start_at: None,
            done_criteria: None,
            budget: None,
            priority: Priority::None,
            status,
            project_id: None,
            tag_ids: Vec::new(),
            parent_id: None,
            task_kind: TaskKind::Main,
            resources: Vec::new(),
            sort_order: 0,
            archived_at: None,
            created_at: "2026-08-05T00:00:00.000Z".into(),
            updated_at: "2026-08-05T00:00:00.000Z".into(),
            completed_at: None,
            deleted_at: None,
            schema_version: 1,
        }
    }

    #[test]
    fn allows_legal_transitions() {
        assert!(can_transition(TaskStatus::Todo, TaskStatus::InProgress));
        assert!(can_transition(
            TaskStatus::InProgress,
            TaskStatus::Completed
        ));
        assert!(can_transition(TaskStatus::Completed, TaskStatus::Todo));
        assert!(can_transition(TaskStatus::Cancelled, TaskStatus::Todo));
        assert!(can_transition(TaskStatus::Todo, TaskStatus::Todo));
    }

    #[test]
    fn rejects_illegal_transitions() {
        assert!(!can_transition(
            TaskStatus::Completed,
            TaskStatus::Cancelled
        ));
        assert!(!can_transition(
            TaskStatus::Cancelled,
            TaskStatus::InProgress
        ));
        assert!(!can_transition(
            TaskStatus::Completed,
            TaskStatus::InProgress
        ));
    }

    #[test]
    fn completed_sets_and_clears_completed_at() {
        let mut task = task(TaskStatus::InProgress);
        apply_status_transition(&mut task, TaskStatus::Completed, "2026-08-05T10:00:00.000Z")
            .unwrap();
        assert_eq!(
            task.completed_at.as_deref(),
            Some("2026-08-05T10:00:00.000Z")
        );

        apply_status_transition(&mut task, TaskStatus::Todo, "2026-08-05T11:00:00.000Z").unwrap();
        assert_eq!(task.status, TaskStatus::Todo);
        assert!(task.completed_at.is_none());
    }

    #[test]
    fn rejects_illegal_transition_with_error() {
        let mut task = task(TaskStatus::Cancelled);
        let result = apply_status_transition(&mut task, TaskStatus::Completed, "now");
        assert!(matches!(result, Err(AppError::InvalidTransition(_))));
    }
}
