import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase server environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate caller and extract Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing or invalid Authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Bearer access token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin Client with Service Role Key (used strictly server-side)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Validate the caller's JWT directly against Supabase Auth
    const { data: { user: callerUser }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired session token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Authorize caller: Check public.profiles record for role = 'admin' AND is_active = true
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (profileErr || callerProfile?.role !== "admin" || !callerProfile?.is_active) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Active administrator privileges required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request payload
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON request payload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action } = body;

    // Action A: Create Student Auth Account and Profile
    if (action === "create_student") {
      const { rollNumber, fullName, email, password, isActive } = body;

      if (!rollNumber || !fullName || !email) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: rollNumber, fullName, and email." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanRoll = String(rollNumber).trim().toUpperCase();
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanName = String(fullName).trim();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return new Response(
          JSON.stringify({ error: "Invalid email address format." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (cleanRoll.length < 2) {
        return new Response(
          JSON.stringify({ error: "Roll number must be at least 2 characters long." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const studentPassword = password || `mca2527@${cleanRoll.toLowerCase()}`;
      if (studentPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters long." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for uniqueness in profiles table
      const { data: existingProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, roll_number, email")
        .or(`roll_number.eq.${cleanRoll},email.eq.${cleanEmail}`);

      if (existingProfiles && existingProfiles.length > 0) {
        const conflict = existingProfiles[0];
        const msg = conflict.roll_number === cleanRoll
          ? `Roll number ${cleanRoll} is already registered.`
          : `Email address ${cleanEmail} is already registered.`;
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create user in Supabase Auth via Admin API
      const { data: newAuthUser, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: studentPassword,
        email_confirm: true,
        user_metadata: {
          role: "student",
          roll_number: cleanRoll,
          full_name: cleanName,
        },
      });

      if (createAuthErr || !newAuthUser?.user) {
        const errMsg = createAuthErr?.message?.includes("already been registered")
          ? `An account with email '${cleanEmail}' is already registered in Auth.`
          : `Auth account creation failed: ${createAuthErr?.message || "Unknown error"}`;
        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert profile into public.profiles
      const { data: newProfile, error: insertProfileErr } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: newAuthUser.user.id,
          roll_number: cleanRoll,
          full_name: cleanName,
          email: cleanEmail,
          role: "student",
          is_active: isActive ?? true,
        })
        .select()
        .single();

      if (insertProfileErr) {
        // Rollback created auth user if profile insert fails
        await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);
        return new Response(
          JSON.stringify({ error: `Profile creation failed: ${insertProfileErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, student: newProfile }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action B: Reset Student Password
    if (action === "reset_password") {
      const { studentId, newPassword } = body;
      if (!studentId || !newPassword) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: studentId and newPassword." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (newPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters long." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify target student exists and is not an administrator
      const { data: targetProfile, error: targetErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, roll_number")
        .eq("id", studentId)
        .single();

      if (targetErr || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "Student profile not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetProfile.role === "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: Cannot reset administrator passwords via student management." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        studentId,
        { password: newPassword }
      );

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: updateErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action C: Update Student (Auth + Profile two-way synchronization)
    if (action === "update_student") {
      const { studentId, rollNumber, fullName, email, isActive } = body;
      if (!studentId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: studentId." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Fetch current profile
      const { data: targetProfile, error: targetErr } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", studentId)
        .single();

      if (targetErr || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "Student profile not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetProfile.role === "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: Cannot modify administrator account through student management." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanRoll = rollNumber ? String(rollNumber).trim().toUpperCase() : targetProfile.roll_number;
      const cleanEmail = email ? String(email).trim().toLowerCase() : targetProfile.email;
      const cleanName = fullName ? String(fullName).trim() : targetProfile.full_name;
      const activeStatus = isActive !== undefined ? Boolean(isActive) : targetProfile.is_active;

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return new Response(
          JSON.stringify({ error: "Invalid email address format." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check roll number uniqueness if changed
      if (cleanRoll !== targetProfile.roll_number) {
        const { data: rollConflict } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("roll_number", cleanRoll)
          .neq("id", studentId)
          .maybeSingle();

        if (rollConflict) {
          return new Response(
            JSON.stringify({ error: `Roll number ${cleanRoll} is already registered to another student.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Check email uniqueness in profiles if changed
      if (cleanEmail !== targetProfile.email) {
        const { data: emailConflict } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", cleanEmail)
          .neq("id", studentId)
          .maybeSingle();

        if (emailConflict) {
          return new Response(
            JSON.stringify({ error: `Email address ${cleanEmail} is already in use by another student profile.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 2. Synchronize Auth user email if changed
      const originalAuthEmail = targetProfile.email;
      if (cleanEmail !== targetProfile.email) {
        const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(
          studentId,
          {
            email: cleanEmail,
            email_confirm: true,
            user_metadata: {
              role: "student",
              roll_number: cleanRoll,
              full_name: cleanName,
              email: cleanEmail,
            },
          }
        );

        if (authUpdateErr) {
          return new Response(
            JSON.stringify({ error: `Failed to update Auth email: ${authUpdateErr.message}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 3. Update public.profiles
      const { data: updatedProfile, error: profileUpdateErr } = await supabaseAdmin
        .from("profiles")
        .update({
          roll_number: cleanRoll,
          full_name: cleanName,
          email: cleanEmail,
          is_active: activeStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", studentId)
        .select()
        .single();

      if (profileUpdateErr) {
        // Rollback Auth email if it was modified
        if (cleanEmail !== targetProfile.email) {
          await supabaseAdmin.auth.admin.updateUserById(studentId, {
            email: originalAuthEmail,
          });
        }
        return new Response(
          JSON.stringify({ error: `Failed to update student profile: ${profileUpdateErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, student: updatedProfile }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action D: Delete / Deactivate Student
    if (action === "delete_student") {
      const { studentId } = body;
      if (!studentId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: studentId." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: targetProfile, error: targetErr } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", studentId)
        .single();

      if (targetErr || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "Student profile not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetProfile.role === "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: Cannot delete administrator accounts." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if student has final submissions
      const { data: submission } = await supabaseAdmin
        .from("submissions")
        .select("id")
        .eq("student_id", studentId)
        .maybeSingle();

      if (submission) {
        // Safe Deactivation: Account has final submission, preserve historical answers
        await supabaseAdmin
          .from("profiles")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", studentId);

        await supabaseAdmin.auth.admin.updateUserById(studentId, {
          ban_duration: "876000h",
        });

        return new Response(
          JSON.stringify({
            success: true,
            softDeleted: true,
            message: "Student account has an active final submission. Account was safely deactivated to preserve yearbook memory records.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // No submission: safe permanent deletion
      await supabaseAdmin.from("answers").delete().or(`respondent_id.eq.${studentId},selected_student_id.eq.${studentId}`);
      await supabaseAdmin.from("student_question_order").delete().eq("respondent_id", studentId);

      const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(studentId);
      if (delAuthErr) {
        return new Response(
          JSON.stringify({ error: `Failed to remove Auth user: ${delAuthErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin.from("profiles").delete().eq("id", studentId);

      return new Response(
        JSON.stringify({
          success: true,
          softDeleted: false,
          message: `Student ${targetProfile.full_name} (${targetProfile.roll_number}) account removed successfully.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action E: Reset Student Submission
    if (action === "reset_submission") {
      const { studentId } = body;
      if (!studentId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: studentId." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify target student exists and is not an administrator
      const { data: targetProfile, error: targetErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, roll_number, full_name, is_active")
        .eq("id", studentId)
        .single();

      if (targetErr || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "Student profile not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetProfile.role === "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: Cannot reset administrator accounts." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Invoke atomic RPC admin_reset_student_submission
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("admin_reset_student_submission", {
        p_student_id: studentId,
      });

      if (rpcErr) {
        // Fallback: direct atomic operations with service-role client
        const { error: subErr } = await supabaseAdmin.from("submissions").delete().eq("student_id", studentId);
        const { error: ansErr } = await supabaseAdmin.from("answers").delete().eq("respondent_id", studentId);
        await supabaseAdmin.from("student_question_order").update({ is_marked_for_review: false }).eq("respondent_id", studentId);

        if (subErr || ansErr) {
          return new Response(
            JSON.stringify({ error: `Failed to reset submission: ${subErr?.message || ansErr?.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseAdmin.from("profiles").update({
          first_login_reset_completed: true,
          first_login_reset_at: new Date().toISOString(),
        }).eq("id", studentId);

        await supabaseAdmin.from("student_one_time_resets").upsert({
          student_id: studentId,
          reset_completed: true,
          reset_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Successfully reset submission for ${targetProfile.full_name} (${targetProfile.roll_number}).`,
            student: targetProfile,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: rpcData?.message || `Successfully reset submission for ${targetProfile.full_name} (${targetProfile.roll_number}).`,
          details: rpcData,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action F: Require Password Reset on Student
    if (action === "require_password_change") {
      const { studentId } = body;
      if (!studentId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: studentId." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify target student exists and is not an administrator
      const { data: targetProfile, error: targetErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, roll_number, full_name")
        .eq("id", studentId)
        .single();

      if (targetErr || !targetProfile) {
        return new Response(
          JSON.stringify({ error: "Student profile not found." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetProfile.role === "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden: Cannot require password reset on administrator accounts." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Invoke atomic RPC admin_require_password_change
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("admin_require_password_change", {
        p_student_id: studentId,
      });

      if (rpcErr) {
        const { error: updateErr } = await supabaseAdmin
          .from("profiles")
          .update({
            must_change_password: true,
            password_changed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", studentId);

        if (updateErr) {
          return new Response(
            JSON.stringify({ error: `Failed to require password reset: ${updateErr.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: rpcData?.message || `Successfully required password reset for ${targetProfile.full_name} (${targetProfile.roll_number}).`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
