// A deliberately small orders API used to demonstrate pgoverlay's
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
