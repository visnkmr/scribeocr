#![warn(clippy::disallowed_types)]
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            
        ])
        .build(tauri::generate_context!())
        .expect("Failed to start app");

    app.run(|app_handle, e| match e {
        tauri::RunEvent::ExitRequested { api, .. } => {
            // api.prevent_exit();
        }
        tauri::RunEvent::WindowEvent { event, .. } => match event {
            //when closed with knowledge
            tauri::WindowEvent::CloseRequested { api, .. } => {

                //   // api.prevent_close();
                //   // hide(app_handle.app_handle());
            }
            _ => {}
        },
        _ => {}
    });
}