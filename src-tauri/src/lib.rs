pub mod agents;
pub mod commands;
pub mod db;
pub mod integrations;
pub mod mcp;
pub mod orchestrator;
pub mod skills;
pub mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let app_state = AppState::new().expect("Failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Agent commands
            commands::agent_commands::create_agent,
            commands::agent_commands::get_agents,
            commands::agent_commands::get_agent,
            commands::agent_commands::update_agent,
            commands::agent_commands::delete_agent,
            commands::agent_commands::start_agent,
            commands::agent_commands::stop_agent,
            commands::agent_commands::pause_agent,
            commands::agent_commands::resume_agent,
            commands::agent_commands::send_agent_input,
            commands::agent_commands::get_agent_logs,
            // Swarm commands
            commands::swarm_commands::create_swarm,
            commands::swarm_commands::start_swarm,
            commands::swarm_commands::stop_swarm,
            commands::swarm_commands::delete_swarm,
            commands::swarm_commands::get_swarm_status,
            // Message commands
            commands::message_commands::post_message,
            commands::message_commands::get_messages,
            commands::message_commands::get_knowledge,
            commands::message_commands::add_knowledge,
            // Skill commands
            commands::skill_commands::list_skills,
            commands::skill_commands::get_skill,
            commands::skill_commands::save_skill,
            commands::skill_commands::delete_skill,
            commands::skill_commands::assign_skill,
            commands::skill_commands::import_skill_from_url,
            commands::skill_commands::import_skills_from_path,
            // Settings commands
            commands::settings_commands::get_settings,
            commands::settings_commands::save_settings,
            // Telegram commands
            commands::telegram_commands::test_telegram,
            commands::telegram_commands::start_telegram_bot,
            commands::telegram_commands::stop_telegram_bot,
            // Notion commands
            commands::notion_commands::sync_notion,
            commands::notion_commands::get_tasks,
            commands::notion_commands::update_task,
            commands::notion_commands::create_task,
            commands::notion_commands::delete_task,
            commands::notion_commands::get_swarms,
            // Cron commands
            commands::cron_commands::create_cron_job,
            commands::cron_commands::list_cron_jobs,
            commands::cron_commands::update_cron_job,
            commands::cron_commands::delete_cron_job,
            commands::cron_commands::trigger_cron_job,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // Spawn background task for agent health monitoring
            tauri::async_runtime::spawn(async move {
                agents::manager::health_monitor_loop(handle).await;
            });

            let handle2 = app.handle().clone();
            // Spawn background task for input-wait monitoring
            tauri::async_runtime::spawn(async move {
                agents::input_monitor::input_wait_monitor_loop(handle2).await;
            });

            let handle3 = app.handle().clone();
            // Spawn global cron runner (30 s poll)
            tauri::async_runtime::spawn(async move {
                orchestrator::cron_runner::cron_runner_loop(handle3).await;
            });

            // Start the MCP HTTP server so agents can post to the message bus
            tauri::async_runtime::block_on(async {
                match mcp::start_mcp_server().await {
                    Ok(port) => {
                        mcp::MCP_PORT.set(port).ok();
                        log::info!("MCP server ready on port {}", port);
                    }
                    Err(e) => log::error!("Failed to start MCP server: {}", e),
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Graceful shutdown: kill all running agent processes
                let state = window.state::<AppState>();
                state.shutdown_all_agents();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
