// A deliberately small orders API used to demonstrate pgbranch's
// branch-per-PR workflow. See README.md.
package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	db, err := sql.Open("pgx", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	mux := http.NewServeMux()

	// BRANCH identifies which pgbranch database branch this instance is
	// wired to (set by the per-PR deploy); reported so the preview is
	// self-describing, like a Vercel preview.
	branch := os.Getenv("BRANCH")

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"app": "orders-api", "database_branch": branch, "try": "/db"})
	})

	mux.HandleFunc("GET /db", func(w http.ResponseWriter, r *http.Request) {
		var users, orders int64
		err := db.QueryRowContext(r.Context(),
			`SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM orders)`).Scan(&users, &orders)
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]any{"database_branch": branch, "error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"database_branch": branch, "users": users, "orders": orders})
	})

	mux.HandleFunc("POST /signup", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Email, FullName string }
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var id int64
		err := db.QueryRowContext(r.Context(),
			`INSERT INTO users (email, full_name) VALUES ($1, $2)
			 ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
			 RETURNING id`,
			in.Email, in.FullName).Scan(&id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]int64{"id": id})
	})

	mux.HandleFunc("GET /users/{id}/orders", func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(r.Context(),
			`SELECT id, amount_cents, status FROM orders WHERE user_id = $1 ORDER BY id`,
			r.PathValue("id"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type order struct {
			ID          int64  `json:"id"`
			AmountCents int    `json:"amount_cents"`
			Status      string `json:"status"`
		}
		out := []order{}
		for rows.Next() {
			var o order
			if err := rows.Scan(&o.ID, &o.AmountCents, &o.Status); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			out = append(out, o)
		}
		json.NewEncoder(w).Encode(out)
	})

	log.Println("orders-api listening on :8090")
	log.Fatal(http.ListenAndServe(":8090", mux))
}
