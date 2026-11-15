"use client";
import React from 'react';import AcademyFrame from '../../components/academy-frame.mjs';import AuthoringApp from '../../components/authoring-app.mjs';
export default function Page(){return React.createElement(AcademyFrame,{current:'/authoring'},React.createElement(AuthoringApp))}
