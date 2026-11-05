# Wednesday Challenge (live version)

Everyone sees the same board. Only leaders (with the PIN) can confirm money, post bounties and change the goal.

## Put it online

1. Make a free account at github.com and create a new repository (name it anything).
2. In the repository, choose Add file > Upload files. Drag in EVERYTHING from this folder
   (the `public` folder, the `netlify` folder, `package.json`, `netlify.toml`). Commit.
3. Go to app.netlify.com > Add new project > Import an existing project > GitHub, and pick the repository.
   Netlify reads `netlify.toml` by itself. Click Deploy.
4. In Netlify: Project configuration > Environment variables > Add a variable:
   Key `LEADER_PIN`, Value = a PIN you choose (4 to 8 digits). Save.
5. Deploys > Trigger deploy > Deploy project. Wait for it to finish.
6. Open your site, go to Give, scroll to Leaders and enter the PIN.

Keep the PIN to the treasurer and youth leaders only. To change it, edit the variable and trigger a deploy.

## Notes
- Data lives in Netlify Blobs, so it stays when you redeploy.
- Transaction codes are only visible to leaders.
- Reset everything clears the data for everyone.
